import { Tool } from "@/tool/tool"
import z from "zod"
import { Agent } from "@/agent/agent"

const DESCRIPTION = `Request to switch to a different mode. This tool allows modes to request switching to another mode when needed, such as switching to Code mode to make code changes. The user must approve the mode switch.`

const parameters = z.object({
  mode_slug: z.string().describe("Slug of the mode to switch to (e.g., code, ask, architect)"),
  reason: z.string().describe("Explanation for why the mode switch is needed"),
})

export const SwitchModeTool = Tool.define("switch_mode", async () => {
  const agents = await Agent.list()
  const availableModes = agents
    .filter((a) => a.mode === "primary" || a.mode === "all")
    .map((a) => `- ${a.name}: ${a.description ?? "No description available"}`)
    .join("\n")

  const description = DESCRIPTION + `\n\nAvailable modes:\n${availableModes}`

  return {
    description,
    parameters,
    async execute(params, ctx) {
      const agent = await Agent.get(params.mode_slug)

      if (!agent) {
        const availableAgents = (await Agent.list())
          .filter((a) => a.mode === "primary" || a.mode === "all")
          .map((a) => a.name)
        return {
          title: "Mode Switch Failed",
          output: `Unknown mode: "${params.mode_slug}". Available modes are: ${availableAgents.join(", ")}`,
          metadata: {
            success: false,
            requestedMode: params.mode_slug,
            reason: params.reason,
          },
        }
      }

      // Request permission for mode switch
      await ctx.ask({
        permission: "switch_mode",
        patterns: [params.mode_slug],
        always: [],
        metadata: {
          reason: params.reason,
          mode: params.mode_slug,
        },
      })

      ctx.metadata({
        title: `Switch to ${params.mode_slug}`,
        metadata: {
          success: true,
          requestedMode: params.mode_slug,
          reason: params.reason,
        },
      })

      return {
        title: `Switch to ${params.mode_slug}`,
        output: `Mode switch requested.\n\nTarget mode: ${params.mode_slug}\nReason: ${params.reason}\n\nThe user will need to approve this mode switch. Once approved, the conversation will continue in ${params.mode_slug} mode.`,
        metadata: {
          success: true,
          requestedMode: params.mode_slug,
          reason: params.reason,
        },
      }
    },
  }
})
