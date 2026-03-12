import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import { Log } from "../../src/util/log"
import { Server } from "../../src/server/server"
import { parseSSE } from "../../src/control-plane/sse"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { ModelsDev } from "../../src/provider/models"
import { resetDatabase } from "../fixture/db"
import { tmpdir } from "../fixture/fixture"

type Capture = {
   url: URL
   headers: Headers
   body: Record<string, unknown>
}

const state = {
   server: null as ReturnType<typeof Bun.serve> | null,
   queue: [] as Array<{ path: string; response: Response; resolve: (value: Capture) => void }>,
}

function deferred<T>() {
   const result = {} as { promise: Promise<T>; resolve: (value: T) => void }
   result.promise = new Promise((resolve) => {
      result.resolve = resolve
   })
   return result
}

function wait(pathname: string, response: Response) {
   const next = deferred<Capture>()
   state.queue.push({ path: pathname, response, resolve: next.resolve })
   return next.promise
}

function sse(input: Array<object | string>) {
   const payload = [...input, "[DONE]"]
      .map((item) => `data: ${typeof item === "string" ? item : JSON.stringify(item)}`)
      .join("\n\n") + "\n\n"
   const encoder = new TextEncoder()
   return new ReadableStream<Uint8Array>({
      start(controller) {
         controller.enqueue(encoder.encode(payload))
         controller.close()
      },
   })
}

function chat(text: string, opts?: { finish?: string; usage?: Record<string, unknown> }) {
   return sse([
      {
         id: "chatcmpl-1",
         object: "chat.completion.chunk",
         choices: [{ delta: { role: "assistant" } }],
      },
      {
         id: "chatcmpl-1",
         object: "chat.completion.chunk",
         choices: [{ delta: { content: text } }],
      },
      {
         id: "chatcmpl-1",
         object: "chat.completion.chunk",
         choices: [{ delta: {}, finish_reason: opts?.finish ?? "stop" }],
      },
      ...(opts?.usage
         ? [
            {
               id: "chatcmpl-1",
               object: "chat.completion.chunk",
               choices: [],
               usage: opts.usage,
            },
         ]
         : []),
   ])
}

async function collect(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
   const seen: unknown[] = []
   await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
         reject(new Error("timed out waiting for [DONE]"))
      }, 3000)

      void parseSSE(body, signal, (evt) => {
         seen.push(evt)
         const next = evt as { type?: string; properties?: { data?: string } }
         if (next.type !== "sse.message" || next.properties?.data !== "[DONE]") return
         clearTimeout(timeout)
         resolve()
      }).catch((err) => {
         clearTimeout(timeout)
         reject(err)
      })
   })
   return seen
}

async function fixture() {
   const file = path.join(import.meta.dir, "../tool/fixtures/models-api.json")
   const data = await Filesystem.readJson<Record<string, ModelsDev.Provider>>(file)
   const provider = data["openai"]
   if (!provider) throw new Error("missing openai fixture")
   const model = provider.models["gpt-5.2"]
   if (!model) throw new Error("missing gpt-5.2 fixture")
   return { provider, model }
}

async function project() {
   if (!state.server) throw new Error("mock server not initialized")
   const item = await fixture()
   return tmpdir({
      git: true,
      init: async (dir) => {
         await Bun.write(
            path.join(dir, "opencode.json"),
            JSON.stringify({
               $schema: "https://opencode.ai/config.json",
               enabled_providers: ["compat"],
               provider: {
                  compat: {
                     name: "Compat",
                     env: [],
                     npm: "@ai-sdk/openai-compatible",
                     api: "https://api.example.com/v1",
                     models: {
                        [item.model.id]: item.model,
                     },
                     options: {
                        apiKey: "test-key",
                        baseURL: `${state.server?.url.origin}/v1`,
                     },
                  },
               },
            }),
         )
      },
   })
}

beforeAll(() => {
   state.server = Bun.serve({
      port: 0,
      async fetch(req) {
         const next = state.queue.shift()
         if (!next) return new Response("unexpected request", { status: 500 })

         const url = new URL(req.url)
         const body = (await req.json()) as Record<string, unknown>
         next.resolve({ url, headers: req.headers, body })

         if (!url.pathname.endsWith(next.path)) {
            return new Response("not found", { status: 404 })
         }

         return next.response
      },
   })
})

beforeEach(() => {
   state.queue.length = 0
})

afterEach(async () => {
   await resetDatabase()
})

afterAll(() => {
   state.server?.stop()
})

Log.init({ print: false })

describe("server openai chat completions", () => {
   test("lists available models in OpenAI shape", async () => {
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/models", {
               headers: { "x-opencode-directory": tmp.path },
            })

            expect(res.status).toBe(200)
            expect(res.headers.get("content-type")).toContain("application/json")

            const body = await res.json()
            expect(body).toMatchObject({
               object: "list",
            })
            expect(Array.isArray(body.data)).toBe(true)

            const data = body.data as Array<{
               id: string
               object: string
               created: number
               owned_by: string
            }>
            const item = data.find((item) => item.id === "compat/gpt-5.2")

            expect(data.map((item) => item.id)).toContain("compat/gpt-5.2")
            expect(data.map((item) => item.id)).not.toContain("gpt-5.2")
            expect(item).toMatchObject({
               id: "compat/gpt-5.2",
               object: "model",
               created: expect.any(Number),
               owned_by: "compat",
            })
         },
      })
   })

   test("streams OpenAI chunks and ends with DONE", async () => {
      const sent = wait(
         "/chat/completions",
         new Response(chat("Hello"), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
         }),
      )
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const stop = new AbortController()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [{ role: "user", content: "Say hello" }],
                  stream: true,
               }),
               signal: stop.signal,
            })

            expect(res.status).toBe(200)
            expect(res.headers.get("content-type")).toContain("text/event-stream")
            expect(res.body).toBeDefined()

            const seen = await collect(res.body!, stop.signal)
            stop.abort()

            const chunks = seen.filter((item) => (item as { object?: string }).object === "chat.completion.chunk")
            expect(chunks).toHaveLength(3)
            expect(chunks[0]).toMatchObject({
               id: expect.stringMatching(/^chatcmpl_/),
               object: "chat.completion.chunk",
               created: expect.any(Number),
               model: "compat/gpt-5.2",
               choices: [{ delta: { role: "assistant" } }],
            })
            expect(chunks[1]).toMatchObject({
               choices: [{ delta: { content: "Hello" } }],
            })
            expect(chunks[2]).toMatchObject({
               choices: [{ delta: {}, finish_reason: "stop" }],
            })
            expect(seen.at(-1)).toEqual({
               type: "sse.message",
               properties: {
                  data: "[DONE]",
                  id: undefined,
                  retry: 1000,
               },
            })

            const req = await sent
            expect(req.url.pathname).toBe("/v1/chat/completions")
            expect(req.body.stream).toBe(true)
            expect(JSON.stringify(req.body.messages)).toContain("Say hello")
         },
      })
   })

   test("streams a usage chunk before DONE when include_usage is requested", async () => {
      const usage = {
         prompt_tokens: 11,
         completion_tokens: 3,
         total_tokens: 14,
      }
      const sent = wait(
         "/chat/completions",
         new Response(chat("Hello", { usage }), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
         }),
      )
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const stop = new AbortController()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [{ role: "user", content: "Say hello" }],
                  stream: true,
                  stream_options: { include_usage: true },
               }),
               signal: stop.signal,
            })

            expect(res.status).toBe(200)
            expect(res.body).toBeDefined()

            const seen = await collect(res.body!, stop.signal)
            stop.abort()

            const chunks = seen.filter((item) => (item as { object?: string }).object === "chat.completion.chunk")
            expect(chunks).toHaveLength(4)
            expect(chunks[2]).toMatchObject({
               choices: [{ delta: {}, finish_reason: "stop" }],
            })
            expect(chunks[3]).toMatchObject({
               choices: [],
               usage,
            })
            expect(seen.at(-2)).toMatchObject({
               object: "chat.completion.chunk",
               choices: [],
               usage,
            })
            expect(seen.at(-1)).toEqual({
               type: "sse.message",
               properties: {
                  data: "[DONE]",
                  id: undefined,
                  retry: 1000,
               },
            })

            const req = await sent
            expect(req.body.stream).toBe(true)
            expect(JSON.stringify(req.body.messages)).toContain("Say hello")
         },
      })
   })

   test("returns a non-stream completion and forwards developer, system, assistant history, and image parts", async () => {
      const usage = {
         prompt_tokens: 7,
         completion_tokens: 2,
         total_tokens: 9,
      }
      const sent = wait(
         "/chat/completions",
         new Response(chat("Fine", { usage }), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
         }),
      )
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [
                     { role: "developer", content: "Follow policy" },
                     { role: "system", content: "Be terse" },
                     { role: "user", content: "Hi" },
                     { role: "assistant", content: "Hello" },
                     {
                        role: "user",
                        content: [
                           { type: "text", text: "See this" },
                           { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }
                        ],
                     },
                  ],
               }),
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body).toMatchObject({
               object: "chat.completion",
               model: "compat/gpt-5.2",
               choices: [
                  {
                     message: {
                        role: "assistant",
                        content: "Fine",
                     },
                     finish_reason: "stop",
                  },
               ],
               usage,
            })

            const req = await sent
            const reqRaw = JSON.stringify(req.body.messages)
            expect(reqRaw).toContain("Follow policy")
            expect(reqRaw).toContain("Be terse")
            expect(reqRaw).toContain("Hi")
            expect(reqRaw).toContain("Hello")
            expect(reqRaw).toContain("See this")
            expect(reqRaw).toContain("data:image/png;base64,AA==")
         },
      })
   })

   test("accepts common compatible request fields and part metadata", async () => {
      const sent = wait(
         "/chat/completions",
         new Response(chat("Hello"), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
         }),
      )
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [
                     {
                        role: "user",
                        content: [
                           {
                              type: "text",
                              text: "Hello",
                              cache_control: { type: "ephemeral" },
                              copilot_cache_control: { type: "ephemeral" },
                           },
                        ],
                     },
                  ],
                  tools: [
                     {
                        type: "function",
                        function: {
                           name: "lookup",
                           description: "Lookup docs",
                           parameters: {
                              type: "object",
                              properties: {
                                 id: { type: "string" },
                              },
                           },
                        },
                     },
                  ],
                  tool_choice: "auto",
                  parallel_tool_calls: true,
                  extra_body: { trace: { id: "abc" }, tags: ["compat"] },
                  temperature: 0.2,
                  top_p: 0.9,
                  max_tokens: 128,
                  stop: ["END"],
                  seed: 7,
                  response_format: { type: "json_object" },
                  user: "alice",
                  presence_penalty: 0.1,
                  frequency_penalty: 0.2,
                  reasoning_effort: "medium",
                  verbosity: "low",
                  thinking_budget: 32,
               }),
            })

            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({
               object: "chat.completion",
               model: "compat/gpt-5.2",
            })

            const req = await sent
            expect(JSON.stringify(req.body.messages)).toContain("Hello")
         },
      })
   })

   test("replays assistant tool call history and tool results", async () => {
      const sent = wait(
         "/chat/completions",
         new Response(chat("Done"), {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
         }),
      )
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [
                     { role: "user", content: "Find status" },
                     {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                           {
                              type: "function",
                              id: "call_1",
                              function: {
                                 name: "lookup",
                                 arguments: '{"id":"42"}',
                              },
                           },
                        ],
                        reasoning_text: "Need lookup",
                        reasoning_opaque: "opaque-1",
                     },
                     { role: "tool", tool_call_id: "call_1", content: '{"status":"ok"}' },
                     { role: "user", content: "What happened?" },
                  ],
               }),
            })

            expect(res.status).toBe(200)

            const req = await sent
            const raw = JSON.stringify(req.body.messages)
            expect(raw).toContain("Find status")
            expect(raw).toContain("Need lookup")
            expect(raw).toContain("lookup")
            expect(raw).toContain('"call_1"')
            expect(raw).toContain('"role":"tool"')
            expect(raw).toContain('{\\"status\\":\\"ok\\"}')
            expect(raw).toContain("What happened?")
         },
      })
   })

   test("rejects tool messages without a matching assistant tool call", async () => {
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [
                     { role: "user", content: "Hello" },
                     { role: "tool", tool_call_id: "call_1", content: '{}' },
                     { role: "user", content: "Continue" },
                  ],
               }),
            })

            expect(res.status).toBe(400)
            expect(await res.text()).toContain("tool_call_id")
         },
      })
   })

   test("rejects stream options when stream is false", async () => {
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [{ role: "user", content: "Hello" }],
                  stream_options: { include_usage: true },
               }),
            })

            expect(res.status).toBe(400)
            expect(await res.text()).toContain("stream_options")
         },
      })
   })

   test("rejects unsupported image url schemes explicitly", async () => {
      await using tmp = await project()
      await Instance.provide({
         directory: tmp.path,
         fn: async () => {
            const app = Server.App()
            const res = await app.request("/cs/v1/chat/completions", {
               method: "POST",
               headers: { "Content-Type": "application/json", "x-opencode-directory": tmp.path },
               body: JSON.stringify({
                  model: "compat/gpt-5.2",
                  messages: [
                     {
                        role: "user",
                        content: [{ type: "image_url", image_url: { url: "ftp://example.com/cat.png" } }],
                     },
                  ],
               }),
            })

            expect(res.status).toBe(400)
            expect(await res.text()).toContain("image_url")
         },
      })
   })
})
