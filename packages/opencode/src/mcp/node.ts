import { NamedError } from "@opencode-ai/util/error"
import z from "zod/v4"

export namespace MCP {
  export const Failed = NamedError.create(
    "MCPFailed",
    z.object({
      name: z.string(),
    }),
  )

  export async function prompts() {
    return {}
  }

  export async function tools() {
    return {}
  }

  export async function getPrompt() {
    return undefined
  }

  export async function readResource(_clientName: string, _uri: string) {
    throw new Failed({
      name: "node-source-runtime",
    })
  }
}
