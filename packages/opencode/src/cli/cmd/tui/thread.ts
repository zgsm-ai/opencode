import { cmd } from "@/cli/cmd/cmd"
import { tui } from "./app"
import { Rpc } from "@/util/rpc"
import { type rpc } from "./worker"
import path from "path"
import { UI } from "@/cli/ui"
import { iife } from "@/util/iife"
import { Log } from "@/util/log"
import { withNetworkOptions, resolveNetworkOptions } from "@/cli/network"
import type { Event } from "@opencode-ai/sdk/v2"
import type { EventSource } from "./context/sdk"

declare global {
  const COSTRICT_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

let worker: Worker
let client: RpcClient
let url: string
let customFetch: typeof fetch | undefined
let events = createEventSource()
let handlers: Set<(data: any) => void> = new Set()
let unsubs: Set<() => void> = new Set()

let shouldRestartWorker = false
let isRestarting = false
let pendingFetchCount = 0
type PendingRequest = {
  input: RequestInfo | URL
  init?: RequestInit
  resolve: (value: Response) => void
  reject: (reason?: any) => void
}
let fetchQueue: PendingRequest[] = []
let restartPromise: Promise<void> | null = null

function startMemoryMonitor() {
  setInterval(() => {
    const mem = process.memoryUsage()
    Log.Default.info("main process memory", {
      rss: Math.round(mem.rss / 1024 / 1024) + " MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + " MB",
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + " MB",
      external: Math.round(mem.external / 1024 / 1024) + " MB",
    })
  }, 60000)
}

async function createWorker(workerPath: string | URL, networkOpts: any): Promise<void> {
  worker = new Worker(workerPath, {
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
    smol: true,
  })
  worker.onerror = (e) => {
    Log.Default.error(e)
  }
  client = Rpc.client<typeof rpc>(worker)
}

async function restartWorker(workerPath: string | URL, networkOpts: any): Promise<void> {
  if (restartPromise) {
    return restartPromise
  }

  restartPromise = (async () => {
    Log.Default.info("worker restart: waiting for pending requests")
    isRestarting = true

    while (pendingFetchCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    Log.Default.info("worker restart: cleaning up old subscriptions")
    unsubOldClients()

    Log.Default.info("worker restart: shutting down worker")
    try {
      await client.call("shutdown", undefined)
    } catch (e) {
      Log.Default.warn("Worker shutdown failed, proceeding with termination", { error: e })
    }

    Log.Default.info("worker restart: waiting for shutdown to complete")
    await new Promise((resolve) => setTimeout(resolve, 1000))

    Log.Default.info("worker restart: terminating worker")

    const oldWorker = worker
    const oldClient = client
    worker = undefined as any
    client = undefined as any

    oldWorker.terminate()

    Log.Default.info("worker restart: waiting for cleanup")
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    Log.Default.info("worker restart: creating new worker")
    await createWorker(workerPath, networkOpts)

    Log.Default.info("worker restart: waiting for worker initialization")
    await new Promise((resolve) => setTimeout(resolve, 3000))

    refreshClientEventSub()

    const shouldStartServer =
      process.argv.includes("--port") ||
      process.argv.includes("--hostname") ||
      process.argv.includes("--mdns") ||
      networkOpts.mdns ||
      networkOpts.port !== 0 ||
      networkOpts.hostname !== "127.0.0.1"

    if (shouldStartServer) {
      const server = await client.call("server", networkOpts)
      url = server.url
    } else {
      url = "http://costrict.internal"
      customFetch = createWorkerFetch(client)
    }

    isRestarting = false
    Log.Default.info("worker restart: processing queued requests", { count: fetchQueue.length })
    const queue = fetchQueue
    fetchQueue = []

    await new Promise((resolve) => setTimeout(resolve, 50))

    for (const req of queue) {
      try {
        const result = await customFetch?.(req.input, req.init)
        result ? req.resolve(result) : req.reject(new Error("No fetch available"))
      } catch (e) {
        req.reject(e)
      }
    }

    Log.Default.info("worker restart completed")
    restartPromise = null
  })()

  return restartPromise
}

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined

    if (isRestarting) {
      return new Promise<Response>((resolve, reject) => {
        fetchQueue.push({ input, init, resolve, reject })
      })
    }

    pendingFetchCount++
    try {
      Log.Default.info("worker fetch", {
        url: request.url,
      })
      const result = await client.call("fetch", {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body,
      })
      Log.Default.info("worker fetch done", {
        url: request.url,
      })
      return new Response(result.body, {
        status: result.status,
        headers: result.headers,
      })
    } finally {
      pendingFetchCount--
    }
  }
  return fn as typeof fetch
}

function createEventSource(): EventSource {
  return {
    on: (handler) => {
      handlers.add(handler)
      refreshClientEventSub()
      return () => {
        unsubOldClients()
      }
      // Always subscribe to current client
      // const unsub = client.on<Event>("event", handler)
      // return () => {
      //   Log.Default.info("un sub")
      //   unsub()
      // }
    },
  }
}

function unsubOldClients() {
  for (const unsub of unsubs) {
    try {
      unsub()
    } catch (e) {
      Log.Default.warn("Error unsubscribing from old client", { error: e })
    }
  }
  unsubs.clear()
}

function refreshClientEventSub() {
  unsubOldClients()
  for (const handler of handlers) {
    try {
      unsubs.add(client.on<Event>("event", handler))
    } catch (e) {
      Log.Default.warn("Error subscribing to new client", { error: e })
    }
  }
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start opencode tui",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start opencode in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      }),
  handler: async (args) => {
    // Resolve relative paths against PWD to preserve behavior when using --cwd flag
    const baseCwd = process.env.PWD ?? process.cwd()
    const cwd = args.project ? path.resolve(baseCwd, args.project) : process.cwd()
    const localWorker = new URL("./worker.ts", import.meta.url)
    const distWorker = new URL("./cli/cmd/tui/worker.js", import.meta.url)
    const workerPath = await iife(async () => {
      if (typeof COSTRICT_WORKER_PATH !== "undefined") return COSTRICT_WORKER_PATH
      if (await Bun.file(distWorker).exists()) return distWorker
      return localWorker
    })

    // Check if server should be started (port or hostname explicitly set in CLI or config)
    const networkOpts = await resolveNetworkOptions(args)

    try {
      process.chdir(cwd)
    } catch (e) {
      UI.error("Failed to change directory to " + cwd)
      return
    }

    await createWorker(workerPath, networkOpts)

    startMemoryMonitor()

    process.on("uncaughtException", (e) => {
      Log.Default.error(e)
    })
    process.on("unhandledRejection", (e) => {
      Log.Default.error(e)
    })
    process.on("SIGUSR2", async () => {
      await client.call("reload", undefined)
    })

    const prompt = await iife(async () => {
      const piped = !process.stdin.isTTY ? await Bun.stdin.text() : undefined
      if (!args.prompt) return piped
      return piped ? piped + "\n" + args.prompt : args.prompt
    })

    const shouldStartServer =
      process.argv.includes("--port") ||
      process.argv.includes("--hostname") ||
      process.argv.includes("--mdns") ||
      networkOpts.mdns ||
      networkOpts.port !== 0 ||
      networkOpts.hostname !== "127.0.0.1"

    if (shouldStartServer) {
      // Start HTTP server for external access
      const server = await client.call("server", networkOpts)
      url = server.url
    } else {
      // Use direct RPC communication (no HTTP)
      url = "http://costrict.internal"
      customFetch = createWorkerFetch(client)
    }

    // events = createEventSource()
    events.on((event) => {
      // Log.Default.info("client received: ", event)
      if (event.type === "worker.restart.suggested") {
        Log.Default.info("Worker restart suggested", event.properties)
        shouldRestartWorker = true
      }
      if (event.type === "session.idle" && shouldRestartWorker) {
        Log.Default.info("Restarting worker on session idle")
        shouldRestartWorker = false
        restartWorker(workerPath, networkOpts).catch((err) => {
          Log.Default.error("Failed to restart worker", { error: err })
        })
      }
    })

    const dynamicFetch = (input: RequestInfo | URL, init?: RequestInit) =>
      customFetch?.(input, init) ?? Promise.reject(new Error("No fetch available"))
    Object.setPrototypeOf(dynamicFetch, fetch)

    const tuiPromise = tui({
      url,
      fetch: dynamicFetch as typeof fetch,
      events,
      args: {
        continue: args.continue,
        sessionID: args.session,
        agent: args.agent,
        model: args.model,
        prompt,
      },
      onExit: async () => {
        await client.call("shutdown", undefined)
      },
    })

    setTimeout(() => {
      client.call("checkUpgrade", { directory: cwd }).catch(() => {})
    }, 60000)

    await tuiPromise
  },
})
