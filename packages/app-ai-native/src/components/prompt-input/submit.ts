import type { Message, Session } from "@opencode-ai/sdk/v2/client"
import { showToast } from "@opencode-ai/ui/toast"
import { base64Encode } from "@opencode-ai/util/encode"
import { withPromptSeed } from "@opencode-ai/util/prompt-seed"
import { useNavigate } from "@solidjs/router"
import type { Accessor } from "solid-js"
import { createMemo } from "solid-js"
import type { FileSelection } from "@/context/file"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useDeviceLocal } from "@/context/device-local"
import { useDeviceWorkspace } from "@/context/device-workspace"
import { useDeviceSessionStore } from "@/context/device-session"
import { type ImageAttachmentPart, type Prompt, usePrompt } from "@/context/prompt"
import { useDeviceSDK } from "@/context/device-sdk"
import { useConversationAdapter } from "@/context/device-adapter"
import { Identifier } from "@/utils/id"
import { Worktree as WorktreeState } from "@/utils/worktree"
import { buildRequestParts } from "./build-request-parts"
import { setCursorPosition } from "./editor-dom"
import { formatServerError } from "@/utils/server-errors"

type PendingPrompt = {
  abort: AbortController
  cleanup: VoidFunction
}

const pending = new Map<string, PendingPrompt>()

type PromptSubmitInput = {
  info: Accessor<{ id: string } | undefined>
  imageAttachments: Accessor<ImageAttachmentPart[]>
  autoAccept: Accessor<boolean>
  mode: Accessor<"normal" | "shell">
  working: Accessor<boolean>
  editor: () => HTMLDivElement | undefined
  queueScroll: () => void
  promptLength: (prompt: Prompt) => number
  addToHistory: (prompt: Prompt, mode: "normal" | "shell") => void
  resetHistoryNavigation: () => void
  setMode: (mode: "normal" | "shell") => void
  setPopover: (popover: "at" | "slash" | null) => void
  newSessionWorktree?: Accessor<string | undefined>
  onNewSessionWorktreeReset?: () => void
  onSubmit?: () => void
  // Optional hidden instruction injected (as a leading synthetic part) into the
  // first user message of a new session only. Opt-in: when absent, behavior is
  // unchanged.
  hiddenSeed?: Accessor<string | undefined>
  onCommand?: (name: string) => boolean
}

export function createPromptSubmit(input: PromptSubmitInput) {
  const navigate = useNavigate()
  const sdk = useDeviceSDK()
  const globalSync = useGlobalSync()
  const local = useDeviceLocal()
  const workspace = useDeviceWorkspace()
  const store = useDeviceSessionStore()
  const prompt = usePrompt()
  const language = useLanguage()
  const deviceAdapter = useConversationAdapter()

  const errorMessage = (err: unknown) => {
    if (err && typeof err === "object" && "data" in err) {
      const data = (err as { data?: { message?: string } }).data
      if (data?.message) return data.message
    }
    if (err instanceof Error) return err.message
    return language.t("common.requestFailed")
  }

  const sessionID = createMemo(() => local.activeSessionID())

  const abort = async () => {
    const id = sessionID()
    if (!id) return Promise.resolve()

    const queued = pending.get(id)
    if (queued) {
      queued.abort.abort()
      queued.cleanup()
      pending.delete(id)
      return Promise.resolve()
    }
    return deviceAdapter
      .sessionAbort(id)
      .catch(() => {})
  }

  const handleSubmit = async (event: Event) => {
    event.preventDefault()

    const currentPrompt = prompt.current()
    const text = currentPrompt.map((part) => ("content" in part ? part.content : "")).join("")
    const images = input.imageAttachments().slice()
    const mode = input.mode()

    if (text.trim().length === 0 && images.length === 0) {
      if (input.working()) abort()
      return
    }

    if (text.startsWith("/")) {
      const commandName = text.trim().slice(1).split(/\s/)[0]
      if (input.onCommand?.(commandName)) return
    }

    const currentModel = local.model.current()
    const currentAgent = local.agent.current()
    if (!currentModel || !currentAgent) {
      showToast({
        title: language.t("prompt.toast.modelAgentRequired.title"),
        description: language.t("prompt.toast.modelAgentRequired.description"),
      })
      return
    }

    const image = images.some((file) => file.mime.startsWith("image/"))
    if (image) {
      showToast({
        title: language.t("prompt.toast.imageUnsupported.title"),
        description: language.t("prompt.toast.imageUnsupported.description"),
      })
      return
    }

    const cap = currentModel.capabilities
    const bad = images.some((file) => {
      if (!cap) return false
      if (!cap.attachment) return true
      if (file.mime === "application/pdf") return !cap.input.pdf
      if (file.mime.startsWith("image/")) return !cap.input.image
      return true
    })
    if (bad) {
      showToast({
        title: language.t("prompt.toast.attachmentUnsupported.title"),
        description: language.t("prompt.toast.attachmentUnsupported.description"),
      })
      return
    }

    input.addToHistory(currentPrompt, mode)
    input.resetHistoryNavigation()

    const projectDirectory = sdk.directory
    const existingSession = input.info() as Session | undefined
    const currentSession = existingSession
    const isNewSession = !currentSession
    const shouldAutoAccept = !existingSession && input.autoAccept()
    const worktreeSelection = input.newSessionWorktree?.() || "main"

    let sessionDirectory = projectDirectory
    let client = sdk.client
    let conversation = deviceAdapter

    if (isNewSession) {
      if (worktreeSelection === "create") {
        const createdWorktree = await conversation
          .worktreeCreate(projectDirectory)
          .then((x: any) => x?.data ?? x)
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.worktreeCreateFailed.title"),
              description: errorMessage(err),
            })
            return undefined
          })

        if (!createdWorktree?.directory) {
          showToast({
            title: language.t("prompt.toast.worktreeCreateFailed.title"),
            description: language.t("common.requestFailed"),
          })
          return
        }
        WorktreeState.pending(createdWorktree.directory)
        sessionDirectory = createdWorktree.directory
      }

      if (worktreeSelection !== "main" && worktreeSelection !== "create") {
        sessionDirectory = worktreeSelection
      }

      if (sessionDirectory !== projectDirectory) {
        client = sdk.createClient({
          directory: sessionDirectory,
          throwOnError: true,
        })
        conversation = deviceAdapter
        globalSync.child(sessionDirectory)
      }

      input.onNewSessionWorktreeReset?.()
    }

    let session = currentSession as Session | undefined

    if (!session && isNewSession) {
      const created = await conversation
        .sessionCreate()
        .then((x: any) => x?.data ?? x)
        .catch(() => undefined)
      if (!created?.id) {
        showToast({
          title: language.t("prompt.toast.sessionCreateFailed.title"),
          description: language.t("common.requestFailed"),
        })
        return
      }
      session = created as Session
    }
    if (!session) {
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: language.t("prompt.toast.promptSendFailed.description"),
      })
      return
    }

    input.onSubmit?.()

    const model = {
      modelID: currentModel.id,
      providerID: currentModel.provider.id,
    }
    const agent = currentAgent.name
    const variant = local.model.variant.current()

    const clearInput = () => {
      prompt.reset()
      input.setMode("normal")
      input.setPopover(null)
    }

    const restoreInput = () => {
      prompt.set(currentPrompt, input.promptLength(currentPrompt))
      input.setMode(mode)
      input.setPopover(null)
      requestAnimationFrame(() => {
        const editor = input.editor()
        if (!editor) return
        editor.focus()
        setCursorPosition(editor, input.promptLength(currentPrompt))
        input.queueScroll()
      })
    }

    if (mode === "shell") {
      clearInput()
      if (isNewSession) {
        const cb = local.onSessionCreated?.()
    cb?.({ sessionID: session.id, title: session.title })
        if (shouldAutoAccept) workspace.autoAccept.enable()
      }
      void conversation
        .sessionShell({
          sessionID: session.id,
          agent,
          model,
          command: text,
        })
        .catch((err) => {
          showToast({
            title: language.t("prompt.toast.shellSendFailed.title"),
            description: errorMessage(err),
          })
          restoreInput()
        })
      return
    }

    if (text.startsWith("/")) {
      const [cmdName, ...args] = text.split(" ")
      const commandName = cmdName.slice(1)
      const commands = workspace.data.command.length > 0 ? workspace.data.command : await workspace.command.load()
      const customCommand = commands.find((c) => c.name === commandName || c.aliases?.includes(commandName))
      if (customCommand && (customCommand.scope === "prompt" || !customCommand.scope)) {
        clearInput()
        if (isNewSession) {
          const cb = local.onSessionCreated?.()
    cb?.({ sessionID: session.id, title: session.title })
          if (shouldAutoAccept) workspace.autoAccept.enable()
        }
        void conversation
          .sessionCommand({
            sessionID: session.id,
            command: commandName,
            arguments: args.join(" "),
            agent,
            model: `${model.providerID}/${model.modelID}`,
            variant,
            parts: images.map((attachment) => ({
              id: Identifier.ascending("part"),
              type: "file" as const,
              mime: attachment.mime,
              url: attachment.dataUrl,
              filename: attachment.filename,
            })),
          })
          .catch((err) => {
            showToast({
              title: language.t("prompt.toast.commandSendFailed.title"),
              description: formatServerError(err, language.t, language.t("common.requestFailed")),
            })
            restoreInput()
          })
        return
      }
    }

    const context = prompt.context.items().slice()

    const messageID = Identifier.ascending("message")
    // Opt-in hidden instruction seeding (e.g. the in-page skill-writer). The
    // instruction must live INSIDE the user message text so the model obeys it
    // (the device merges multiple text parts into one and drops `synthetic`).
    // We separate it from the user's text with a unique sentinel; the UI leaf
    // strips everything up to the sentinel so the bubble shows only the user's
    // words. Only seed on the first message of a new session; later messages
    // already carry it in history. History/optimistic messageID and the prompt
    // history keep the user's ORIGINAL `text` untouched.
    const seed = isNewSession ? input.hiddenSeed?.() : undefined
    const sendText = seed ? withPromptSeed(seed, text) : text
    const { requestParts, optimisticParts } = buildRequestParts({
      prompt: currentPrompt,
      context,
      images,
      text: sendText,
      sessionID: session.id,
      messageID,
      sessionDirectory,
    })

    const optimisticMessage: Message = {
      id: messageID,
      sessionID: session.id,
      role: "user",
      time: { created: Date.now() },
      agent,
      model,
    }

    const addOptimisticMessage = () =>
      store.optimisticAdd({
        sessionID: session.id,
        message: optimisticMessage,
        parts: optimisticParts,
      })

    const removeOptimisticMessage = () =>
      store.optimisticRemove({
        sessionID: session.id,
        messageID,
      })

    clearInput()

    if (isNewSession) {
      const cb = local.onSessionCreated?.()
    cb?.({ sessionID: session.id, title: session.title })
      if (shouldAutoAccept) workspace.autoAccept.enable()
    }

    addOptimisticMessage()

    const waitForWorktree = async () => {
      const worktree = WorktreeState.get(sessionDirectory)
      if (!worktree || worktree.status !== "pending") return true

      if (sessionDirectory === projectDirectory) {
        workspace.session.setStatus(session.id, { type: "busy" })
      }

      const controller = new AbortController()
      const cleanup = () => {
        if (sessionDirectory === projectDirectory) {
          workspace.session.setStatus(session.id, { type: "idle" })
        }
        removeOptimisticMessage()
        restoreInput()
      }

      pending.set(session.id, { abort: controller, cleanup })

      const abortWait = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        if (controller.signal.aborted) {
          resolve({ status: "failed", message: "aborted" })
          return
        }
        controller.signal.addEventListener(
          "abort",
          () => {
            resolve({ status: "failed", message: "aborted" })
          },
          { once: true },
        )
      })

      const timeoutMs = 5 * 60 * 1000
      const timer = { id: undefined as number | undefined }
      const timeout = new Promise<Awaited<ReturnType<typeof WorktreeState.wait>>>((resolve) => {
        timer.id = window.setTimeout(() => {
          resolve({
            status: "failed",
            message: language.t("workspace.error.stillPreparing"),
          })
        }, timeoutMs)
      })

      const result = await Promise.race([WorktreeState.wait(sessionDirectory), abortWait, timeout]).finally(() => {
        if (timer.id === undefined) return
        clearTimeout(timer.id)
      })
      pending.delete(session.id)
      if (controller.signal.aborted) return false
      if (result.status === "failed") throw new Error(result.message)
      return true
    }

    const send = async () => {
      const ok = await waitForWorktree()
      if (!ok) return
      await conversation.sessionPromptAsync({
        sessionID: session.id,
        agent,
        model,
        messageID,
        parts: requestParts,
        variant,
      })
    }

    void send().catch((err) => {
      pending.delete(session.id)
      if (sessionDirectory === projectDirectory) {
        workspace.session.setStatus(session.id, { type: "idle" })
      }
      showToast({
        title: language.t("prompt.toast.promptSendFailed.title"),
        description: errorMessage(err),
      })
      removeOptimisticMessage()
      restoreInput()
    })
  }

  return {
    abort,
    handleSubmit,
  }
}
