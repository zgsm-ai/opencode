import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Installation } from "@/installation"
import { Log } from "@/util/log"
import { loadCoStrictCredentials, saveCoStrictCredentials } from "@/costrict/provider/credentials"
import { extractExpiryFromJWT, isCoStrictTokenValid, parseJWT, refreshCoStrictToken } from "@/costrict/provider/token"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { SessionID } from "@/session/schema"
import { Instance } from "@/project/instance"
import { git } from "@/util/git"
import { getRawDumpEventEnvKey, type RawDumpEventPayload } from "./spawn"

const log = Log.create({ service: "raw-dump.worker" })
const STATE_FILE = path.join(os.homedir(), ".costrict", "raw-dump-state.json")

type RawDumpState = {
  conversation: Record<string, true>
  commits: Record<string, string>
}

type JwtPayload = {
  sub?: string
  name?: string
  id?: string
  universal_id?: string
  displayName?: string
  properties?: {
    oauth_GitHub_username?: string
  }
}

function createEmptyState(): RawDumpState {
  return {
    conversation: {},
    commits: {},
  }
}

async function readState() {
  try {
    const text = await fs.readFile(STATE_FILE, "utf-8")
    const parsed = JSON.parse(text) as Partial<RawDumpState>
    return {
      conversation: parsed.conversation ?? {},
      commits: parsed.commits ?? {},
    } satisfies RawDumpState
  } catch {
    return createEmptyState()
  }
}

async function writeState(state: RawDumpState) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8")
}

function formatIso(ms: number | undefined) {
  if (!ms) return ""
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function detectSender(parts: MessageV2.Part[]) {
  return parts.some((part) => part.type === "subtask") ? "agent" : "user"
}

function extractUserContent(parts: MessageV2.Part[]) {
  return parts
    .filter((part): part is MessageV2.TextPart => part.type === "text" && !part.ignored)
    .map((part) => part.text)
    .join("\n")
}

function extractResponseContent(parts: MessageV2.Part[]) {
  return parts
    .filter((part): part is MessageV2.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function countDiffLines(diff: string) {
  let count = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) count++
  }
  if (count === 0 && diff.trim()) return diff.trim().split("\n").length
  return count
}

function extractFilesFromDiff(diff: string) {
  const files = new Set<string>()
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) files.add(line.slice(6).trim())
    else if (line.startsWith("--- a/")) files.add(line.slice(6).trim())
    else if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/)
      if (match?.[2]) files.add(match[2])
    }
  }
  return Array.from(files)
}

function toCommitComment(subject: string) {
  return Array.from(subject).slice(0, 150).join("")
}

function extractDiffFromParts(parts: MessageV2.Part[]) {
  const diffs: string[] = []
  const files = new Set<string>()

  for (const part of parts) {
    if (part.type === "tool") {
      const input = part.state.input ?? {}
      if (typeof input.content === "string" && input.content) diffs.push(input.content)
      else if (typeof input.new_string === "string" && input.new_string) diffs.push(input.new_string)
      else if (typeof input.diff === "string" && input.diff) diffs.push(input.diff)
      else if (typeof input.patch === "string" && input.patch) diffs.push(input.patch)
    }

    if (part.type === "patch") {
      for (const file of part.files) files.add(file)
    }
  }

  const diff = diffs.join("\n")
  for (const file of extractFilesFromDiff(diff)) files.add(file)
  return {
    diff,
    diff_lines: countDiffLines(diff),
    files: Array.from(files),
  }
}

function extractError(info: MessageV2.Assistant) {
  const error = info.error
  if (!error) return {}

  const name = "name" in error ? error.name : "UnknownError"
  const message = "message" in error && typeof error.message === "string" ? error.message : name
  const errorCode =
    name === "ProviderAuthError"
      ? 401
      : name === "ContextOverflowError" || name === "MessageOutputLengthError"
        ? 413
        : name === "MessageAbortedError"
          ? 499
          : name === "APIError" && "statusCode" in error && typeof error.statusCode === "number"
            ? error.statusCode
            : 500

  return {
    error_code: errorCode,
    error_reason: message,
  }
}

function extractRequestMetrics(user: MessageV2.WithParts, assistant: MessageV2.WithParts) {
  const requestContent = extractUserContent(user.parts)
  const responseContent = extractResponseContent(assistant.parts)
  const ttftPart = assistant.parts.find(
    (part): part is MessageV2.TextPart | MessageV2.ReasoningPart =>
      (part.type === "text" || part.type === "reasoning") && !!part.time?.start,
  )
  const processTtft =
    ttftPart?.time?.start && user.info.time.created ? Math.max(0, ttftPart.time.start - user.info.time.created) : 0
  const diffData = extractDiffFromParts(assistant.parts)

  return {
    sender: detectSender(user.parts),
    request_content: requestContent,
    response_content: responseContent,
    process_ttft: processTtft,
    ...diffData,
    ...extractError(assistant.info as MessageV2.Assistant),
  }
}

function parseUser(accessPayload: JwtPayload, refreshPayload?: JwtPayload | null) {
  // 优先从 refresh_token 取（与 costrict 保持一致）
  if (refreshPayload) {
    return {
      user_id: refreshPayload.universal_id ?? refreshPayload.sub ?? refreshPayload.id ?? "",
      user_name: refreshPayload.properties?.oauth_GitHub_username || refreshPayload.id || "",
    }
  }
  // fallback 到 access_token
  return {
    user_id: accessPayload.universal_id ?? accessPayload.sub ?? accessPayload.id ?? "",
    user_name: accessPayload.displayName ?? accessPayload.name ?? "",
  }
}

function detectOs() {
  const map: Record<string, string> = {
    darwin: "MacOS",
    win32: "Windows",
    linux: "Linux",
  }
  return map[process.platform] ?? process.platform
}

async function auth() {
  let creds = await loadCoStrictCredentials()
  if (!creds?.access_token) throw new Error("Not authenticated")

  if (creds.refresh_token && !isCoStrictTokenValid(creds)) {
    const next = await refreshCoStrictToken({
      baseUrl: creds.base_url,
      refreshToken: creds.refresh_token,
      state: creds.state,
    })
    await saveCoStrictCredentials({
      ...creds,
      access_token: next.access_token,
      refresh_token: next.refresh_token,
      expiry_date: extractExpiryFromJWT(next.access_token),
      updated_at: new Date().toISOString(),
      expired_at: new Date(extractExpiryFromJWT(next.access_token)).toISOString(),
    })
    creds = { ...creds, access_token: next.access_token, refresh_token: next.refresh_token }
  }

  const headers = new Headers()
  headers.set("Authorization", `Bearer ${creds.access_token}`)
  headers.set("Content-Type", "application/json")
  headers.set("HTTP-Referer", "https://github.com/zgsm-ai/costrict-cli")
  headers.set("X-Title", "CoStrict-CLI")
  headers.set("X-Costrict-Version", `costrict-cli-${Installation.VERSION}`)
  headers.set("zgsm-client-id", Installation.getInstallationId())
  headers.set("zgsm-client-ide", "cli")

  const accessPayload = parseJWT(creds.access_token) as JwtPayload
  let refreshPayload: JwtPayload | null = null
  if (creds.refresh_token) {
    try {
      refreshPayload = parseJWT(creds.refresh_token) as JwtPayload
    } catch {
      refreshPayload = null
    }
  }

  return {
    baseUrl: resolveRawDumpBaseUrl(creds.base_url),
    headers,
    user: parseUser(accessPayload, refreshPayload),
  }
}

function resolveRawDumpBaseUrl(baseUrl?: string) {
  const explicit = process.env.COSTRICT_RAW_DUMP_BASE_URL || process.env.OPENCODE_RAW_DUMP_BASE_URL
  if (explicit) return explicit.replace(/\/$/, "")

  const raw = (baseUrl || process.env.COSTRICT_BASE_URL || "https://zgsm.sangfor.com").replace(/\/$/, "")
  if (raw.includes("/chat-rag/api/forward")) {
    try {
      const url = new URL(raw)
      const target = url.searchParams.get("target")
      if (target) return new URL(target).origin
      return url.origin
    } catch {
      return raw
    }
  }
  return raw.replace(/\/cloud-api$/, "")
}

function getRawDumpUrl(baseUrl: string, endpoint: string) {
  const suffix = endpoint.startsWith("/") ? endpoint : `/${endpoint}`
  return `${baseUrl}/user-indicator/api/v1${suffix}`
}

async function postJson(baseUrl: string, headers: Headers, endpoint: string, body: Record<string, unknown>) {
  log.debug("raw dump request", {
    endpoint,
    body,
  })

  const res = await fetch(getRawDumpUrl(baseUrl, endpoint), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    log.debug("raw dump response", {
      endpoint,
      status: res.status,
      ok: res.ok,
      body: text,
    })
    throw new Error(`${endpoint} failed: ${res.status} ${text}`)
  }

  log.debug("raw dump response", {
    endpoint,
    status: res.status,
    ok: res.ok,
  })
}

async function gitText(args: string[], cwd: string) {
  const result = await git(["-C", cwd, ...args], { cwd })
  return result.exitCode === 0 ? result.text().trim() : ""
}

async function getRepoInfo(workDir: string) {
  const [repoAddr, repoBranch, gitUserName, gitUserEmail] = await Promise.all([
    gitText(["remote", "get-url", "origin"], workDir),
    gitText(["branch", "--show-current"], workDir),
    gitText(["config", "user.name"], workDir),
    gitText(["config", "user.email"], workDir),
  ])

  return {
    repo_addr: repoAddr,
    repo_branch: repoBranch,
    git_user_name: gitUserName,
    git_user_email: gitUserEmail,
  }
}

async function computeRawDiff(messages: MessageV2.WithParts[], workDir: string): Promise<string> {
  let from: string | undefined
  let to: string | undefined
  for (const item of messages) {
    if (!from) {
      for (const part of item.parts as any[]) {
        if (part.type === "step-start" && part.snapshot) {
          from = part.snapshot
          break
        }
      }
    }
    for (const part of item.parts as any[]) {
      if (part.type === "step-finish" && part.snapshot) {
        to = part.snapshot
      }
    }
  }
  if (from && to && from !== to) {
    return await gitText(["diff", "--no-ext-diff", from, to], workDir)
  }
  return ""
}

async function getConversationRawDiff(
  session: Session.Info,
  user: MessageV2.WithParts,
  assistant: MessageV2.WithParts,
): Promise<string> {
  const fromPart = (user.parts as any[]).find((p) => p.type === "step-start" && p.snapshot)
  const toPart = (assistant.parts as any[]).find((p) => p.type === "step-finish" && p.snapshot)
  const from = fromPart?.snapshot as string | undefined
  const to = toPart?.snapshot as string | undefined
  if (from && to && from !== to) {
    return await gitText(["diff", "--no-ext-diff", from, to], session.directory)
  }
  return ""
}

function buildConversationKey(taskID: string, requestID: string) {
  return `${taskID}:${requestID}`
}

async function uploadConversation(payload: {
  session: Session.Info
  user: MessageV2.WithParts & { info: MessageV2.User }
  assistant: MessageV2.WithParts & { info: MessageV2.Assistant }
  messages: MessageV2.WithParts[]
  authData: Awaited<ReturnType<typeof auth>>
  state: RawDumpState
}) {
  const assistantInfo = payload.assistant.info
  const requestID = assistantInfo.requestID || assistantInfo.id
  const key = buildConversationKey(payload.session.id, requestID)
  if (payload.state.conversation[key]) {
    log.info("raw dump conversation skipped", {
      task_id: payload.session.id,
      request_id: requestID,
      reason: "already_uploaded",
    })
    return false
  }

  const rawDiff = await getConversationRawDiff(payload.session, payload.user, payload.assistant)
  const request = extractRequestMetrics(payload.user, payload.assistant)
  const body = {
    task_id: payload.session.id,
    request_id: requestID,
    prompt_mode: payload.user.info.variant ?? "",
    mode: assistantInfo.mode ?? assistantInfo.agent ?? "code",
    model: assistantInfo.modelID ?? payload.user.info.model.modelID,
    start_time: formatIso(payload.user.info.time.created),
    end_time: formatIso(assistantInfo.time.completed ?? assistantInfo.time.created),
    process_time: Math.max(0, (assistantInfo.time.completed ?? assistantInfo.time.created) - payload.user.info.time.created),
    process_ttft: request.process_ttft,
    upstream_tokens: assistantInfo.tokens.input + assistantInfo.tokens.cache.read + assistantInfo.tokens.cache.write,
    downstream_tokens: assistantInfo.tokens.output,
    cost: assistantInfo.cost,
    sender: request.sender,
    request_content: request.request_content,
    response_content: request.response_content,
    user_input: request.sender === "user" ? request.request_content : "",
    diff: rawDiff || request.diff,
    diff_lines: rawDiff ? countDiffLines(rawDiff) : request.diff_lines,
    files: rawDiff ? extractFilesFromDiff(rawDiff) : request.files,
    ...("error_code" in request ? { error_code: request.error_code } : {}),
    ...("error_reason" in request ? { error_reason: request.error_reason } : {}),
  }

  await postJson(payload.authData.baseUrl, payload.authData.headers, "/raw-store/task-conversation", body)
  payload.state.conversation[key] = true
  log.info("raw dump conversation uploaded", {
    task_id: payload.session.id,
    request_id: requestID,
  })
  return true
}

async function uploadSummary(payload: {
  session: Session.Info
  messages: MessageV2.WithParts[]
  authData: Awaited<ReturnType<typeof auth>>
}) {
  const repoInfo = await getRepoInfo(payload.session.directory)
  const rawDiff = await computeRawDiff(payload.messages, payload.session.directory)
  const assistants = payload.messages.filter((item): item is MessageV2.WithParts & { info: MessageV2.Assistant } => item.info.role === "assistant")

  const body = {
    task_id: payload.session.id,
    start_time: formatIso(payload.session.time.created),
    end_time: formatIso(payload.session.time.updated),
    ...payload.authData.user,
    client_id: Installation.getInstallationId(),
    client_ide: "cli",
    client_version: Installation.VERSION,
    client_os: detectOs(),
    client_os_version: os.release(),
    caller: "chat",
    repo_addr: repoInfo.repo_addr,
    repo_branch: repoInfo.repo_branch,
    work_dir: payload.session.directory,
    upstream_tokens: assistants.reduce(
      (sum: number, item: MessageV2.WithParts & { info: MessageV2.Assistant }) => sum + item.info.tokens.input + item.info.tokens.cache.read + item.info.tokens.cache.write,
      0,
    ),
    downstream_tokens: assistants.reduce((sum: number, item: MessageV2.WithParts & { info: MessageV2.Assistant }) => sum + item.info.tokens.output, 0),
    cost: assistants.reduce((sum: number, item: MessageV2.WithParts & { info: MessageV2.Assistant }) => sum + item.info.cost, 0),
    diff: rawDiff,
    diff_lines: rawDiff ? countDiffLines(rawDiff) : 0,
    files: rawDiff ? extractFilesFromDiff(rawDiff) : [],
  }

  await postJson(payload.authData.baseUrl, payload.authData.headers, "/raw-store/task-summary", body)
  log.info("raw dump summary uploaded", {
    task_id: payload.session.id,
  })
}

function parseCommitLog(output: string) {
  if (!output.trim()) return [] as Array<{ commit_id: string; commit_time: string; git_user_name: string; git_user_email: string; subject: string }>
  return output
    .split("\n")
    .map((line) => {
      const [commit_id, commit_time, git_user_name, git_user_email, ...rest] = line.split("|")
      if (!commit_id || !git_user_email) return null
      return {
        commit_id,
        commit_time,
        git_user_name,
        git_user_email,
        subject: rest.join("|"),
      }
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
}

async function uploadCommits(payload: {
  workDir: string
  authData: Awaited<ReturnType<typeof auth>>
  state: RawDumpState
}) {
  const repoInfo = await getRepoInfo(payload.workDir)
  if (!repoInfo.repo_addr || !repoInfo.repo_branch) {
    log.info("raw dump commit skipped", {
      work_dir: payload.workDir,
      reason: "missing_repo_info",
    })
    return 0
  }

  const stateKey = `${repoInfo.repo_addr}#${repoInfo.repo_branch}#${payload.workDir}`
  const lastCommit = payload.state.commits[stateKey]
  const args = lastCommit
    ? ["log", `${lastCommit}..HEAD`, "--format=%H|%aI|%an|%ae|%s"]
    : ["log", "--since=30 days ago", "--format=%H|%aI|%an|%ae|%s"]
  const logText = await gitText(args, payload.workDir)
  const commits = parseCommitLog(logText)
  if (!commits.length) {
    log.info("raw dump commit skipped", {
      work_dir: payload.workDir,
      reason: "no_new_commits",
    })
    return 0
  }

  for (const commit of commits) {
    const diff = await gitText(["show", "--format=", "--diff-filter=ACDMR", commit.commit_id], payload.workDir)
    const body = {
      commit_id: commit.commit_id,
      commit_time: commit.commit_time,
      repo_addr: repoInfo.repo_addr,
      repo_branch: repoInfo.repo_branch,
      git_user_name: commit.git_user_name,
      git_user_email: commit.git_user_email,
      ...payload.authData.user,
      client_id: Installation.getInstallationId(),
      client_version: Installation.VERSION,
      client_ide: "cli",
      work_dir: payload.workDir,
      diff_lines: countDiffLines(diff),
      diff,
      files: extractFilesFromDiff(diff),
      comment: toCommitComment(commit.subject),
      subject: commit.subject,
    }
    await postJson(payload.authData.baseUrl, payload.authData.headers, "/raw-store/commit", body)
    log.info("raw dump commit uploaded", {
      commit_id: commit.commit_id,
      repo_addr: repoInfo.repo_addr,
      repo_branch: repoInfo.repo_branch,
    })
  }

  payload.state.commits[stateKey] = commits[0]!.commit_id
  return commits.length
}

function parseWorkerPayload(): RawDumpEventPayload {
  const raw = process.env[getRawDumpEventEnvKey()]
  if (!raw) throw new Error("missing raw dump payload")
  return JSON.parse(raw) as RawDumpEventPayload
}

export async function runRawDumpWorker() {
  try {
    const payload = parseWorkerPayload()
    log.info("raw dump worker started", {
      session_id: payload.sessionID,
      message_id: payload.messageID,
      directory: payload.directory,
    })

    await Instance.provide({
      directory: payload.directory,
      fn: async () => {
        const authData = await auth()
        const session = await Session.get(SessionID.make(payload.sessionID))
        const messages = await Session.messages({ sessionID: SessionID.make(payload.sessionID) })
        log.info("raw dump session loaded", {
          session_id: session.id,
          message_count: messages.length,
          directory: session.directory,
        })
        const assistant = messages.find(
          (item): item is MessageV2.WithParts & { info: MessageV2.Assistant } =>
            item.info.id === payload.messageID && item.info.role === "assistant",
        )
        if (!assistant || assistant.info.role !== "assistant") {
          log.info("raw dump worker skipped", {
            session_id: payload.sessionID,
            message_id: payload.messageID,
            reason: "assistant_message_not_found",
          })
          return
        }
        const user = messages.find(
          (item): item is MessageV2.WithParts & { info: MessageV2.User } =>
            item.info.id === assistant.info.parentID && item.info.role === "user",
        )
        if (!user || user.info.role !== "user") {
          log.info("raw dump worker skipped", {
            session_id: payload.sessionID,
            message_id: payload.messageID,
            reason: "parent_user_message_not_found",
          })
          return
        }

        const state = await readState()
        const conversationUploaded = await uploadConversation({ session, user, assistant, messages, authData, state })
        await uploadSummary({ session, messages, authData })
        const commitCount = await uploadCommits({ workDir: session.directory, authData, state })
        await writeState(state)
        log.info("raw dump worker completed", {
          session_id: session.id,
          message_id: payload.messageID,
          conversation_uploaded: conversationUploaded,
          commits_uploaded: commitCount,
        })
      },
    })
  } catch (error) {
    log.warn("raw dump worker failed", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
