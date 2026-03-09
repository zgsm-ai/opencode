import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { ToolRegistry } from "../tool/registry"
import { Installation } from "../installation"
import z from "zod"

export namespace McpServe {
  function stubCtx() {
    return {
      sessionID: "mcp",
      messageID: "mcp",
      agent: "mcp",
      abort: new AbortController().signal,
      messages: [],
      metadata: () => {},
      ask: async () => {},
    }
  }

  export async function createServer() {
    const server = new McpServer({
      name: "costrict",
      version: Installation.VERSION,
    })
    const tools = await ToolRegistry.tools({ providerID: "", modelID: "" })
    for (const tool of tools) {
      if (tool.id === "invalid" || tool.id === "question") continue
      const schema = tool.parameters
      if (!(schema instanceof z.ZodObject)) continue
      server.tool(tool.id, tool.description, schema.shape, async (args) => {
        const result = await tool.execute(args as any, stubCtx())
        return { content: [{ type: "text" as const, text: result.output }] }
      })
    }
    return server
  }

  export async function start() {
    const server = await createServer()
    await server.connect(new StdioServerTransport())
    await new Promise(() => {})
  }
}
