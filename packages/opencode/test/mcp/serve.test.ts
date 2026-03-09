import { describe, test, expect, spyOn } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import z from "zod"
import { Instance } from "../../src/project/instance"
import { McpServe } from "../../src/mcp/serve"
import { Server } from "../../src/server/server"
import { Installation } from "../../src/installation"
import { ToolRegistry } from "../../src/tool/registry"
import { tmpdir } from "../fixture/fixture"

function stub(id: string, out = id) {
  return {
    id,
    description: id,
    parameters: z.object({
      command: z.string().optional(),
      description: z.string().optional(),
    }),
    execute: async () => ({
      title: "",
      output: out,
      metadata: {},
    }),
  }
}

describe("mcp serve - HTTP routes", () => {
  test("GET /mcp/health returns ok", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([
      { id: "bash" },
      { id: "invalid" },
      { id: "question" },
    ] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const res = await Server.App().request("/mcp/health")
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body).toEqual({
            status: "ok",
            version: Installation.VERSION,
            toolCount: 1,
          })
        },
      })
    } finally {
      spy.mockRestore()
    }
  })

  test("GET /mcp/tool returns MCP tool definitions", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([
      stub("bash"),
      stub("read"),
      { id: "invalid", description: "", parameters: z.object({}), execute: async () => ({ title: "", output: "", metadata: {} }) },
    ] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const res = await Server.App().request("/mcp/tool")
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body).toHaveLength(2)
          expect(body.map((item: { id: string }) => item.id)).toEqual(["bash", "read"])
          expect(body[0]).toMatchObject({
            id: "bash",
            description: "bash",
          })
          expect(body[0].parameters).toMatchObject({
            type: "object",
            properties: {
              command: {
                type: "string",
              },
              description: {
                type: "string",
              },
            },
          })
        },
      })
    } finally {
      spy.mockRestore()
    }
  })

  test("GET /mcp/tool filters by id", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([stub("bash"), stub("read")] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const res = await Server.App().request("/mcp/tool?id=read")
          expect(res.status).toBe(200)
          const body = await res.json()
          expect(body).toHaveLength(1)
          expect(body[0]).toMatchObject({
            id: "read",
            description: "read",
          })
        },
      })
    } finally {
      spy.mockRestore()
    }
  })
})

describe("mcp serve - MCP over HTTP", () => {
  test("tools/list via POST /mcp/rpc", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([stub("bash"), stub("read"), stub("edit")] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const app = Server.App()
          const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp/rpc"), {
            fetch: (url, init) => Promise.resolve(app.fetch(new Request(url, init))),
          })
          const client = new Client({ name: "test", version: "1.0.0" })
          await client.connect(transport)
          const { tools } = await client.listTools()
          expect(tools.map((t) => t.name)).toEqual(["bash", "read", "edit"])
          await client.close()
        },
      })
    } finally {
      spy.mockRestore()
    }
  })

  test("tools/call via POST /mcp/rpc executes bash", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([stub("bash", "hello-mcp")] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const app = Server.App()
          const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp/rpc"), {
            fetch: (url, init) => Promise.resolve(app.fetch(new Request(url, init))),
          })
          const client = new Client({ name: "test", version: "1.0.0" })
          await client.connect(transport)

          const result = await client.callTool({
            name: "bash",
            arguments: { command: "echo hello-mcp", description: "test" },
          })
          expect(((result.content as { text: string }[])[0]).text).toContain("hello-mcp")

          await client.close()
        },
      })
    } finally {
      spy.mockRestore()
    }
  })
})

describe("mcp serve - stdio (InMemoryTransport)", () => {
  test("tools/list returns opencode tools", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([stub("bash"), stub("read"), stub("edit")] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
          const server = await McpServe.createServer()
          await server.connect(serverTransport)

          const client = new Client({ name: "test", version: "1.0.0" })
          await client.connect(clientTransport)

          const { tools } = await client.listTools()
          expect(tools.map((t) => t.name)).toEqual(["bash", "read", "edit"])

          await client.close()
        },
      })
    } finally {
      spy.mockRestore()
    }
  })

  test("tools/call bash returns output", async () => {
    const spy = spyOn(ToolRegistry, "tools").mockResolvedValue([stub("bash", "hello-mcp")] as any)
    await using tmp = await tmpdir({ git: true })
    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
          const server = await McpServe.createServer()
          await server.connect(serverTransport)

          const client = new Client({ name: "test", version: "1.0.0" })
          await client.connect(clientTransport)

          const result = await client.callTool({
            name: "bash",
            arguments: { command: "echo hello-mcp", description: "test" },
          })
          expect(((result.content as { text: string }[])[0]).text).toContain("hello-mcp")

          await client.close()
        },
      })
    } finally {
      spy.mockRestore()
    }
  })
})
