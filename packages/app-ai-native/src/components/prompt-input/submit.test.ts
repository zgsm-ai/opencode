import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { Prompt } from "@/context/prompt"

let createPromptSubmit: typeof import("./submit").createPromptSubmit

const createdClients: string[] = []
const createdSessions: string[] = []
const enabledAutoAccept: number[] = []
const sentShell: string[] = []
const syncedDirectories: string[] = []
const toasts: unknown[] = []

type Model = {
  id: string
  provider: { id: string }
  capabilities?: {
    attachment: boolean
    input: { image: boolean; pdf: boolean }
  }
}

let selected = "/repo/worktree-a"
let model: Model = { id: "model", provider: { id: "provider" } }

const promptValue: Prompt = [{ type: "text", content: "ls", start: 0, end: 2 }]

const clientFor = (directory: string) => {
  createdClients.push(directory)
  return {
    session: {
      create: async () => {
        createdSessions.push(directory)
        return { data: { id: `session-${createdSessions.length}` } }
      },
      shell: async () => {
        sentShell.push(directory)
        return { data: undefined }
      },
      prompt: async () => ({ data: undefined }),
      command: async () => ({ data: undefined }),
      abort: async () => ({ data: undefined }),
    },
    worktree: {
      create: async () => ({ data: { directory: `${directory}/new` } }),
    },
  }
}

beforeAll(async () => {
  const rootClient = clientFor("/repo/main")

  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => ({}),
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null }),
  }))

  mock.module("@opencode-ai/sdk/v2/client", () => ({
    createOpencodeClient: (input: { directory: string }) => {
      createdClients.push(input.directory)
      return clientFor(input.directory)
    },
  }))

  mock.module("@opencode-ai/ui/toast", () => ({
    showToast: (input: unknown) => {
      toasts.push(input)
      return 0
    },
  }))

  mock.module("@opencode-ai/util/encode", () => ({
    base64Encode: (value: string) => value,
  }))

  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => model,
        variant: { current: () => undefined },
      },
      agent: {
        current: () => ({ name: "agent" }),
      },
    }),
  }))

  // submit.ts reads model/agent/session from the device-local context
  // (post-refactor), so mock the same shape useLocal used to expose.
  mock.module("@/context/device-local", () => ({
    useDeviceLocal: () => ({
      slug: () => "device",
      activeSessionID: () => undefined,
      setActiveSession: () => undefined,
      onSessionCreated: () => undefined,
      navigateBack: () => undefined,
      setOnSessionCreated: () => undefined,
      setNavigateBack: () => undefined,
      agent: {
        list: () => [{ name: "agent" }],
        current: () => ({ name: "agent" }),
        set: () => undefined,
        move: () => undefined,
      },
      model: {
        ready: () => true,
        current: () => model,
        set: () => undefined,
        list: () => [model],
        recent: () => [model],
        cycle: () => undefined,
        visible: () => true,
        setVisibility: () => undefined,
        variant: {
          configured: () => undefined,
          selected: () => undefined,
          current: () => undefined,
          list: () => [],
          set: () => undefined,
          cycle: () => undefined,
        },
      },
    }),
  }))

  mock.module("@/context/device-workspace", () => ({
    useDeviceWorkspace: () => ({
      status: () => "ready",
      data: { command: [] },
      command: { load: async () => [] },
      autoAccept: {
        enabled: () => false,
        enable: () => {
          enabledAutoAccept.push(1)
        },
        disable: () => undefined,
        toggle: () => undefined,
      },
      session: { setStatus: () => undefined },
    }),
  }))

  mock.module("@/context/device-session", () => ({
    useDeviceSessionStore: () => ({
      optimisticAdd: () => undefined,
      optimisticRemove: () => undefined,
    }),
  }))

  mock.module("@/context/permission", () => ({
    usePermission: () => ({
      enableAutoAccept() {
        enabledAutoAccept.push(1)
      },
    }),
  }))

  mock.module("@/context/prompt", () => ({
    usePrompt: () => ({
      current: () => promptValue,
      reset: () => undefined,
      set: () => undefined,
      context: {
        add: () => undefined,
        remove: () => undefined,
        items: () => [],
      },
    }),
  }))

  mock.module("@/context/layout", () => ({
    useLayout: () => ({
      handoff: {
        setTabs: () => undefined,
      },
    }),
  }))

  mock.module("@/context/device-sdk", () => ({
    useDeviceSDK: () => {
      const sdk = {
        directory: "/repo/main",
        client: rootClient,
        url: "http://localhost:4096",
        createClient(opts: any) {
          return clientFor(opts.directory)
        },
      }
      return sdk
    },
  }))

  mock.module("@/context/sync", () => ({
    useSync: () => ({
      data: { command: [] },
      session: {
        onSessionCreated: () => undefined,
        optimistic: {
          add: () => undefined,
          remove: () => undefined,
        },
      },
      set: () => undefined,
    }),
  }))

  mock.module("@/context/global-sync", () => ({
    useGlobalSync: () => ({
      child: (directory: string) => {
        syncedDirectories.push(directory)
        return [{}, () => undefined]
      },
    }),
  }))

  mock.module("@/context/platform", () => ({
    usePlatform: () => ({
      fetch: fetch,
    }),
  }))

  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: string) => key,
    }),
  }))

  mock.module("@/context/device-adapter", () => ({
    useConversationAdapter: () => ({
      sessionCreate: async () => {
        createdSessions.push("created")
        return { data: { id: `session-${createdSessions.length}` } }
      },
      sessionShell: async () => {
        sentShell.push("shell")
      },
      sessionCommand: async () => undefined,
      sessionAbort: async () => undefined,
    }),
    ConversationAdapterContext: {
      Provider: (props: any) => props.children,
    },
  }))

  const mod = await import("./submit")
  createPromptSubmit = mod.createPromptSubmit
})

beforeEach(() => {
  createdClients.length = 0
  createdSessions.length = 0
  enabledAutoAccept.length = 0
  sentShell.length = 0
  syncedDirectories.length = 0
  toasts.length = 0
  model = { id: "model", provider: { id: "provider" } }
  selected = "/repo/worktree-a"
})

describe("prompt submit worktree selection", () => {
  test("reads the latest worktree accessor value per submit", async () => {
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    selected = "/repo/worktree-b"
    await submit.handleSubmit(event)

    expect(createdClients).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
    expect(createdSessions.length).toBe(2)
    expect(sentShell.length).toBe(2)
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
  })

  test("applies auto-accept to newly created sessions", async () => {
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [],
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(enabledAutoAccept).toEqual([1])
  })

  test("blocks image attachments when the selected model lacks image support", async () => {
    model = {
      id: "model",
      provider: { id: "provider" },
      capabilities: {
        attachment: true,
        input: { image: false, pdf: true },
      },
    }
    let history = 0
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [
        {
          type: "image",
          id: "img",
          filename: "image.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,AA==",
        },
      ],
      autoAccept: () => true,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => {
        history += 1
      },
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(history).toBe(0)
    expect(createdSessions).toEqual([])
    expect(toasts).toEqual([
      {
        title: "prompt.toast.attachmentUnsupported.title",
        description: "prompt.toast.attachmentUnsupported.imageDescription",
      },
    ])
  })

  test("lets image attachments through when the selected model supports them", async () => {
    model = {
      id: "model",
      provider: { id: "provider" },
      capabilities: {
        attachment: true,
        input: { image: true, pdf: true },
      },
    }
    let history = 0
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [
        {
          type: "image",
          id: "img",
          filename: "image.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,AA==",
        },
      ],
      autoAccept: () => true,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => {
        history += 1
      },
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(toasts).toEqual([])
    expect(history).toBe(1)
    expect(createdSessions.length).toBe(1)
  })

  test("refuses to send when an attachment is in unsupported (404) state", async () => {
    model = {
      id: "model",
      provider: { id: "provider" },
      capabilities: {
        attachment: true,
        input: { image: true, pdf: true },
      },
    }
    let history = 0
    const submit = createPromptSubmit({
      info: () => undefined,
      imageAttachments: () => [
        {
          type: "image",
          id: "img",
          filename: "image.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,AA==",
          uploadState: "unsupported",
        },
      ],
      autoAccept: () => true,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => {
        history += 1
      },
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(history).toBe(0)
    expect(createdSessions).toEqual([])
    expect(toasts).toEqual([
      {
        title: "prompt.toast.attachmentUpgradeRequired.title",
        description: "prompt.toast.attachmentUpgradeRequired.description",
      },
    ])
  })
})
