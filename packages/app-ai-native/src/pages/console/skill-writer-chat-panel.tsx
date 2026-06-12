import { createEffect, createMemo, createResource, on, onCleanup, Show, untrack } from "solid-js"
import type { Part } from "@opencode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { ServerConnection, ServerProvider } from "@/context/server"
import { DeviceInterface, useDeviceLayout } from "@/pages/workspace/components/device-interface"
import { useDeviceSDK } from "@/context/device-sdk"
import { DeviceSessionProvider, DeviceSessionStoreProvider, useDeviceSession } from "@/context/device-session"
import { ContentTabContext, createContentTabStore } from "@/context/content-tabs"
import { DeviceSessionView } from "@/pages/workspace/components/device-session-view"
import { DeviceSessionChatProvider } from "@/context/device-session-chat"
import { deviceApi } from "@/pages/workspace/lib/api"
import { deviceFileApi } from "@/pages/workspace/lib/cloud-device-api"
import { getProxyUrl } from "@/pages/workspace/lib/url"
import { createDeviceClient } from "@/client/device-client"
import type { Device } from "@/pages/workspace/types"

// Web-customized skill-writer instructions seeded as a HIDDEN prefix of the
// first user message. The device merges multiple text parts of a user message
// into one and drops the `synthetic` flag, so the instruction must live inside
// the message text; it is separated from the user's request by a unique
// sentinel (see `withPromptSeed`) and stripped at the UI leaf so the bubble
// shows only the user's words. We no longer drive the device-side
// `/skill-writer` slash command (which has no optimistic message and, in the
// precompiled cs-cloud build, references a PublishSkill tool that isn't shipped).
// Sending these instructions as a normal prompt keeps streaming responsive and
// lets us steer the device agent toward the WEB authoring/publish flow.
const SKILL_WRITER_INSTRUCTIONS = `You are CoStrict's skill-writer, helping the user author a brand-new reusable skill from inside the web "create capability" page. A skill is a SKILL.md Markdown file (YAML frontmatter + body) stored at .claude/skills/<skill-name>/SKILL.md on the connected device. It encodes a repeatable workflow as a prompt + permissions, not executable code — written for ANOTHER assistant instance to use later.

The user's skill request appears after the marker line below. If it is empty or unclear, ask what the skill should do FIRST via AskUserQuestion before doing anything else.

Operating rules:
- Drive every choice through AskUserQuestion, never via plain text. Ask the most important thing first; ~1 topic per round. The user always has a freeform "Other" option, so do not add your own "let me edit" options.
- Keep the skill focused on ONE workflow. The skill takes effect on the device the moment the file is written.

Step 1 — Name: propose a <skill-name> (lowercase letters/numbers/hyphens only, <=64 chars, no reserved words "anthropic"/"claude", avoid vague names; prefer gerund form like "reviewing-prs", "analyzing-logs"). Offer 2-3 candidates when it is not obvious.

Step 2 — Interview via AskUserQuestion (~1 topic/round): (a) what should this skill let the assistant DO; (b) when should it TRIGGER — exact phrases/contexts the user would say; (c) what does the OUTPUT / "done" look like.

Step 3 — Write .claude/skills/<skill-name>/SKILL.md (run mkdir -p on the dir first, then use the Write tool):
---
name: <skill-name>
description: <THIRD PERSON, ON ONE LINE. What it does AND when to use it, with literal quoted trigger phrases. <=1024 chars; keep it to a SINGLE line — do NOT use YAML block scalars (> or |) or raw line breaks; no XML tags; must not contain "anthropic" or "claude".>
tags: [<tag1>, <tag2>, <tag3>]
allowed-tools: [Read, Edit, Bash]   # optional; omit if unsure
---
# <Title Case Name>
## When to use
<the trigger, in plain language>
## Steps
1. <imperative step> — done when: <verifiable artifact/criteria>
## Output
<what success looks like>

Spend real effort on \`description\` (third person; include BOTH what it does AND concrete quoted trigger phrases; lean slightly pushy to avoid under-triggering). Body in imperative/infinitive voice; explain the WHY behind steps rather than piling ALL-CAPS MUSTs; keep it tight (<~500 lines); offload long detail to references/<topic>.md next to SKILL.md.

Publishing — IMPORTANT: this is the WEB authoring flow. Do NOT call any PublishSkill tool and do NOT attempt to publish from the device. After you write or refine SKILL.md, the file is automatically mirrored into the editor on the LEFT side of this page. Finish by telling the user in one or two short lines: the skill has been generated and synced to the editor on the left — review it there and click the publish/create button to publish it to the CoStrict store. Show the skill name and a 2-line summary of what you wrote.`
const TAB_KEY = "skill-writer"

// SILENT device reads for the AUTOMATIC sync paths (poll snapshot, tool-event
// watcher, idle trigger). These bypass `deviceFileApi.list`/`read`, which call
// `showToast(...)` on ANY failure (e.g. "无法读取文件 / file not found"). During
// authoring the agent often `mkdir`s the skill dir before SKILL.md exists (or
// while a write-permission prompt is still pending), so the auto sync would
// repeatedly read a not-yet-existing file every 2s and on every parts change —
// flooding the screen with error toasts (70+, even covering the permission
// buttons). For the auto path a missing file/dir is EXPECTED, not an error, so
// we read directly via the low-level device client and swallow failures
// silently (no toast).
const silentClient = (proxyId: string) => createDeviceClient({ baseUrl: getProxyUrl(proxyId) })

// List directory entries silently; returns [] on any failure (incl. dir not
// existing yet). Never shows a toast.
async function silentList(
  proxyId: string,
  path: string,
): Promise<Array<{ name: string; type: "directory" | "file" }>> {
  try {
    return await silentClient(proxyId).runtime.fileList(path)
  } catch {
    return []
  }
}

// Read a file's text content silently; returns undefined on any failure (incl.
// file not written yet). Never shows a toast.
async function silentRead(proxyId: string, absPath: string): Promise<string | undefined> {
  try {
    const res = await silentClient(proxyId).runtime.fileRead(absPath)
    return res.content
  } catch {
    return undefined
  }
}

export type SkillWriterChatPanelProps = {
  // Called once the device agent has written a new skill and its SKILL.md has
  // been read back; the parent fills the editor for review.
  onSkillReady: (skillMdText: string, name: string) => void
  // Reports whether at least one online device exists, so the parent can gate
  // the panel's column / resize handle. Optional.
  onAvailabilityChange?: (available: boolean) => void
}

// Resolving the device's default directory does a proxied call into the device
// agent, which can fail for many reasons (device offline mid-flight, network
// blip, proxy/CORS error). We must NEVER let that throw out of a resource
// accessor — that would bubble to the top-level ErrorBoundary and blank the
// whole editor page. So the fetcher swallows the error and returns a tagged
// result; the panel renders an inline error+retry state instead.
type DirectoryState = { ok: true; directory: string } | { ok: false }

/**
 * In-page device chat for the capability editor's "AI create" flow.
 *
 * Auto-selects the first online device, mounts the full device-session stack
 * (the same one the workspace uses), seeds the first message with hidden
 * web-customized skill-writer instructions, and after the agent finishes reads
 * the generated `.claude/skills/<name>/SKILL.md`
 * back so the parent can prefill the editor for human review + the existing
 * publish flow. All compute runs on the device; the web side provides no LLM.
 *
 * Robustness: every device call here is failure-tolerant. Directory resolution
 * degrades to an inline retry panel; the skills-dir snapshot and SKILL.md read
 * are wrapped in try/catch. A device-side failure never escapes this panel, so
 * the editor on the left always stays usable.
 */
export function SkillWriterChatPanel(props: SkillWriterChatPanelProps) {
  const language = useLanguage()
  const [devices] = createResource(async () => {
    try {
      const res = await deviceApi.list()
      return (res.devices ?? []).filter((d) => d.status === "online")
    } catch {
      // A failed device listing must not crash the editor: treat as "no device".
      return []
    }
  })

  // MVP: auto-select the first online device. Multi-device picking is a TODO.
  const device = createMemo<Device | undefined>(() => devices()?.[0])
  const proxyId = createMemo(() => device()?.deviceId)

  createEffect(() => {
    props.onAvailabilityChange?.((devices() ?? []).length > 0)
  })

  const [directory, { refetch: refetchDirectory }] = createResource<DirectoryState, string>(
    proxyId,
    async (id) => {
      try {
        return { ok: true, directory: await deviceFileApi.getDefaultPath(id) }
      } catch {
        // Device proxy unreachable / errored: degrade to an inline error state
        // rather than throwing (which would hit the page-level ErrorBoundary).
        return { ok: false }
      }
    },
  )

  const resolved = createMemo(() => {
    const id = proxyId()
    const dir = directory()
    if (!id || !dir || !dir.ok) return undefined
    return { proxyId: id, directory: dir.directory }
  })

  // Failed to resolve the directory (and not just still loading): show retry.
  const failed = createMemo(() => {
    const dir = directory()
    return Boolean(proxyId()) && dir != null && !directory.loading && !dir.ok
  })

  return (
    <Show
      when={resolved()}
      keyed
      fallback={
        <Show when={failed()}>
          <DeviceConnectError
            label={language.t("store.skillWriter.connectError")}
            retryLabel={language.t("store.skillWriter.retry")}
            onRetry={() => void refetchDirectory()}
          />
        </Show>
      }
    >
      {(v) => <PanelBody directory={v.directory} proxyId={v.proxyId} onSkillReady={props.onSkillReady} />}
    </Show>
  )
}

// Inline, panel-scoped error state for when the device proxy call fails. Lets
// the user retry without reloading the page; the editor on the left keeps
// working regardless.
function DeviceConnectError(props: { label: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div class="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-sm text-[var(--native-muted)]">{props.label}</p>
      <button
        type="button"
        class="shrink-0 rounded-md border border-[color:color-mix(in_srgb,var(--native-border)_48%,transparent)] px-3 py-1.5 text-xs text-[var(--native-foreground)] transition-colors hover:bg-[var(--native-hover)]"
        onClick={() => props.onRetry()}
      >
        {props.retryLabel}
      </button>
    </div>
  )
}

function PanelBody(props: { directory: string; proxyId: string; onSkillReady: (text: string, name: string) => void }) {
  const language = useLanguage()
  const deviceLayout = useDeviceLayout()
  const tabStore = createContentTabStore()

  const proxyUrl = createMemo(() => getProxyUrl(props.proxyId))
  const proxyKey = createMemo(() => ServerConnection.Key.make(proxyUrl()))
  const servers = createMemo<ServerConnection.Http[]>(() => [{ type: "http", http: { url: proxyUrl() } }])

  // Open a single fresh session tab; DeviceSessionTab writes the created
  // sessionID back into this tab's meta once the user sends the first message.
  tabStore.open({
    kind: "session",
    key: TAB_KEY,
    title: language.t("command.session.new"),
    meta: { sessionID: undefined },
  })
  const tabId = tabStore.makeTabId("session", TAB_KEY)

  const sessionID = createMemo(() => (tabStore.tabs().find((t) => t.id === tabId)?.meta as any)?.sessionID as string | undefined)

  // Snapshot the skills directory before the agent runs so we can diff out the
  // newly-created skill while the agent authors it (the polling fallback).
  const skillsDir = `${props.directory}/.claude/skills`
  // The set of skills that already existed when this panel mounted (i.e. before
  // this authoring session). Anything NOT in here is a skill this session
  // produced — that's the only thing the poll ever pushes into the editor.
  let baseline: Set<string> | undefined
  // The last device-side SKILL.md content we pushed into the editor. BOTH sync
  // paths (the tool-event watcher and the poll) share this single dedup, so
  // whoever notices a change first pushes it, and the other never re-pushes the
  // identical content. We only re-push when the device content actually changes,
  // so a user editing the editor (which doesn't touch the device file) is never
  // overwritten.
  let lastLoaded: string | undefined

  const snapshot = async (): Promise<Set<string>> => {
    // AUTO path: silent read. The skills dir may not exist yet; silentList
    // returns [] (no toast) rather than flooding the UI with "dir not found".
    const entries = await silentList(props.proxyId, skillsDir)
    return new Set(entries.filter((e) => e.type === "directory").map((e) => e.name))
  }

  void snapshot().then((names) => {
    baseline = names
  })

  // The single "read this SKILL.md and mirror it into the editor" primitive,
  // shared by every sync path. Reads the device file SILENTLY (no toast), dedups
  // on `lastLoaded` (unless `force`), and pushes via onSkillReady. A missing /
  // not-yet-written SKILL.md returns false with no toast; a later sync pass picks
  // it up once the file exists.
  const pushSkillFile = async (absPath: string, name: string, force = false): Promise<boolean> => {
    const content = await silentRead(props.proxyId, absPath)
    // SKILL.md not present yet, or device read failed; try again later.
    if (content === undefined) return false
    // Skip if the device content is unchanged since our last push, unless the
    // user explicitly forced a re-pull. This protects in-editor edits from
    // being clobbered, and keeps the sync paths from fighting each other.
    if (!force && content === lastLoaded) return false
    lastLoaded = content
    props.onSkillReady(content, name)
    return true
  }

  // Pull the most-recently-authored skill of THIS session into the editor.
  // Polling FALLBACK: diffs the skills dir against the mount-time baseline and
  // reads the newest added skill's SKILL.md. The tool-event watcher below is the
  // primary, real-time path; this catches anything it misses. `force` bypasses
  // the change-dedup (kept for callers that want to re-push identical content).
  const syncGenerated = async (force = false): Promise<boolean> => {
    // Only consider skills created during this session; never fall back to a
    // pre-existing skill (e.g. commit-guard) — that's not what the user asked
    // the agent to write here. Until the mount-time baseline snapshot resolves we
    // can't tell which skills pre-existed, so a poll/idle fire would treat ALL
    // existing skills as new and mirror an unrelated one — so wait for it.
    if (baseline === undefined) return false
    const before = baseline
    const after = await snapshot()
    const added = [...after].filter((name) => !before.has(name))
    if (added.length === 0) return false
    const target = added[added.length - 1]
    return pushSkillFile(`${skillsDir}/${target}/SKILL.md`, target, force)
  }

  // Real-time sync FALLBACK: while a session exists, poll the device's skills
  // dir and mirror any change in this session's generated SKILL.md into the
  // editor. Kept as a safety net beneath the tool-event watcher; both share
  // `pushSkillFile`'s dedup so they never double-push.
  createEffect(() => {
    if (!sessionID()) return
    const handle = setInterval(() => {
      void syncGenerated()
    }, 2000)
    onCleanup(() => clearInterval(handle))
  })

  return (
    <div class="flex h-full min-h-0 w-full flex-col">
      <ServerProvider defaultServer={proxyKey()} servers={servers()}>
        <DeviceInterface directory={props.directory} deviceLayout={deviceLayout}>
          <ContentTabContext.Provider value={tabStore}>
            <DeviceSessionStoreProvider>
              <DeviceSessionProvider sessionID={sessionID()}>
              {/* PRIMARY real-time sync: react to the agent's write/edit tool
                  calls hitting a skill SKILL.md and mirror it into the editor. */}
              <SkillFileToolWatcher
                directory={props.directory}
                onSkillFile={(absPath, name) => void pushSkillFile(absPath, name)}
              />
              {/* Extra trigger only — the poll/tool-watcher above are the source of truth. */}
              <SessionIdleWatcher onIdle={() => void syncGenerated()} />
              {/* Rename the session away from the device's default (which uses the
                  first user message text = our seeded instruction) so the workspace
                  session list isn't polluted. Best-effort, fires once. */}
              <SessionTitleGuard sessionID={sessionID} />
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DeviceSessionChatProvider>
                  <DeviceSessionView sessionID={sessionID()} hiddenSeed={SKILL_WRITER_INSTRUCTIONS} />
                </DeviceSessionChatProvider>
              </div>
            </DeviceSessionProvider>
            </DeviceSessionStoreProvider>
          </ContentTabContext.Provider>
        </DeviceInterface>
      </ServerProvider>
      <div class="flex shrink-0 items-center gap-3 border-t border-[color:color-mix(in_srgb,var(--native-border)_18%,transparent)] px-4 py-2">
        <span class="min-w-0 truncate text-xs text-[var(--native-muted)]">{language.t("store.skillWriter.fetchHint")}</span>
      </div>
    </div>
  )
}

// Renames the authoring session once, as soon as its id first exists, away from
// the device-default title (which the device derives from the first user message
// text — here that's the seeded skill-writer instruction). Keeps the workspace
// session list from showing a wall of instruction text. Mounted inside
// DeviceInterface so `useDeviceSDK()` is in scope. Best-effort: any failure is
// swallowed so it can never bubble to the page-level ErrorBoundary.
function SessionTitleGuard(props: { sessionID: () => string | undefined }) {
  const device = useDeviceSDK()
  let renamed = false
  createEffect(() => {
    const id = props.sessionID()
    if (renamed || !id) return
    renamed = true
    void device.client.conversation.update(id, { title: "AI 技能创建" }).catch(() => {})
  })
  return null
}

// Watches the active session's status; fires `onIdle` each time it transitions
// from a working state (busy/retry) back to idle, i.e. the agent finished a
// turn. Used to trigger reading the generated SKILL.md back.
function SessionIdleWatcher(props: { onIdle: () => void }) {
  const session = useDeviceSession()
  let wasActive = false

  createEffect(
    on(
      () => ({ id: session.sessionID(), status: session.data.status?.type }),
      ({ id, status }) => {
        if (!id) {
          wasActive = false
          return
        }
        const isActive = status === "busy" || status === "retry"
        if (wasActive && !isActive) props.onIdle()
        wasActive = isActive
      },
    ),
  )

  onCleanup(() => {
    wasActive = false
  })

  return null
}

// Tool ids that write/modify a file on disk. Matched case-insensitively against
// `part.tool`. These are the opencode tool ids (Tool.define("write"|"edit"|...)
// in packages/opencode/src/tool/*); confirmed against the shared UI's
// getToolInfo() switch in packages/ui/src/components/message-part.tsx.
const FILE_WRITE_TOOLS = new Set(["write", "edit", "multiedit", "patch", "str_replace", "apply_patch"])

// Does a path point at a skill's SKILL.md? (path ends with /SKILL.md AND lives
// under a .claude/skills/ dir). Tolerant of both `/` and `\` separators.
function isSkillMdPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/")
  return normalized.endsWith("/SKILL.md") && normalized.includes("/.claude/skills/")
}

// Extract `<name>` from `.../.claude/skills/<name>/SKILL.md`.
function skillNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  const match = normalized.match(/\.claude\/skills\/([^/]+)\/SKILL\.md$/)
  return match?.[1] ?? ""
}

// Pull candidate file paths out of a write/edit tool part's input. The path
// field name isn't typed by the SDK (`state.input` is Record<string, unknown>),
// so we accept the field names the real tools and the shared UI use:
// - write/edit/multiedit → `filePath` (alias `file_path`/`path`), confirmed in
//   packages/opencode/src/tool/{write,edit,multiedit}.ts + the UI's
//   normalizeToolInput (`input.filePath ?? input.file_path`).
// - apply_patch → no single path; it carries `files: string[]` of patched paths
//   (packages/opencode/src/tool/apply_patch.ts + the UI's apply_patch branch).
function filePathsFromToolInput(input: Record<string, unknown> | undefined): string[] {
  if (!input) return []
  const paths: string[] = []
  for (const key of ["filePath", "file_path", "path"]) {
    const value = input[key]
    if (typeof value === "string" && value) paths.push(value)
  }
  const files = input.files
  if (Array.isArray(files)) {
    for (const f of files) if (typeof f === "string" && f) paths.push(f)
  }
  return paths
}

// Watches the session's tool parts and, whenever a completed write/edit tool
// targets this session's skill SKILL.md, hands the (absolute) path + skill name
// up so the parent can read it back and mirror it into the editor.
//
// This is the PRIMARY, real-time sync path: it fires on every write/edit the
// agent performs (initial author AND later refinements), which the directory-
// snapshot poll can lag behind in the real skill-writer flow (long interview,
// SKILL.md written only at the end, then edited repeatedly).
function SkillFileToolWatcher(props: { directory: string; onSkillFile: (absPath: string, name: string) => void }) {
  const session = useDeviceSession()

  createEffect(() => {
    // Tracked scope: iterate the parts store so any change in agent output
    // (new/updated tool part) re-runs this effect. Find the most-recent
    // completed write/edit tool call that hit a skill SKILL.md. "Most recent" by
    // part id (ids are monotonic ulids), so a later edit of the same file wins
    // over an earlier write.
    let best: { id: string; absPath: string; name: string } | undefined
    for (const list of Object.values(session.data.parts)) {
      if (!list) continue
      for (const p of list as Part[]) {
        if (p.type !== "tool") continue
        // ONLY completed write/edit parts. A pending/permission-waiting tool
        // hasn't written the file yet, so reading it would hit a not-yet-
        // existing path. Even for completed parts the read still goes through
        // the SILENT pushSkillFile (there can be a completed→readable race), so
        // a transient miss never produces a toast.
        if (p.state.status !== "completed") continue
        if (!FILE_WRITE_TOOLS.has(p.tool.toLowerCase())) continue
        const candidates = filePathsFromToolInput(p.state.input as Record<string, unknown>)
        for (const raw of candidates) {
          if (!isSkillMdPath(raw)) continue
          // Paths may be absolute or relative to the device's working dir.
          const abs = raw.replace(/\\/g, "/").startsWith("/") ? raw : `${props.directory}/${raw}`
          if (!best || p.id > best.id) best = { id: p.id, absPath: abs, name: skillNameFromPath(raw) }
        }
      }
    }
    // Hand the path up OUTSIDE tracking: the parent's read + onSkillReady push
    // must not register any reactive dependency, so this effect can never form a
    // re-run loop with its own consumers. Dedup against the device content lives
    // in the shared pushSkillFile (lastLoaded), so a parts change that doesn't
    // alter the SKILL.md content is a no-op push.
    if (best) untrack(() => props.onSkillFile(best!.absPath, best!.name))
  })

  return null
}
