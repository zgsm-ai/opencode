import { cmd } from "./cmd"
import { McpServe } from "../../mcp/serve"
import { Instance } from "../../project/instance"

export const McpServeCommand = cmd({
  command: "serve",
  describe: "start costrict as an MCP server via stdio",
  handler: async () => {
    await Instance.provide({
      directory: process.cwd(),
      fn: async () => {
        await McpServe.start()
      },
    })
  },
})
