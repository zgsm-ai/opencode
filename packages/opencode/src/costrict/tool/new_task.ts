import { Tool } from "@/tool/tool"
import z from "zod"
import { Agent } from "@/agent/agent"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { Identifier } from "@/id/id"
import { SessionPrompt } from "@/session/prompt"
import { defer } from "@/util/defer"

const DESCRIPTION = `Create a new task instance in the chosen mode using your provided message and initial todo list (if required).

CRITICAL: This tool MUST be called alone. Do NOT call this tool alongside other tools in the same message turn. If you need to gather information before delegating, use other tools in a separate turn first, then call new_task by itself in the next turn.`

const parameters = z.object({
  mode: z.string().describe("Slug of the mode to begin the new task in (e.g., code, debug, architect)"),
  message: z.string().describe("Initial user instructions or context for the new task"),
  todos: z.string().nullable().describe("Optional initial todo list written as a markdown checklist; required when the workspace mandates todos"),
})

export const NewTaskTool = Tool.define("new_task", async () => {
  const agents = await Agent.list()
  const availableModes = agents
    .map((a) => `- ${a.name}: ${a.description ?? "No description available"}`)
    .join("\n")

  const description = DESCRIPTION + `\n\nAvailable modes:\n${availableModes}`

  return {
    description,
    parameters,
    async execute(params, ctx) {
      const agent = await Agent.get(params.mode)

      if (!agent) {
        const availableAgents = (await Agent.list()).map((a) => a.name)
        return {
          title: "New Task Failed",
          output: `Unknown mode: "${params.mode}". Available modes are: ${availableAgents.join(", ")}`,
          metadata: {
            success: false,
            requestedMode: params.mode,
            sessionId: "",
          },
        }
      }

      // Request permission
      await ctx.ask({
        permission: "new_task",
        patterns: [params.mode],
        always: [],
        metadata: {
          mode: params.mode,
          message: params.message,
        },
      })

      // Get the current message to determine the model
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") {
        throw new Error("Not an assistant message")
      }

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      // Build the prompt with optional todos
      let fullPrompt = params.message
      if (params.todos) {
        fullPrompt = `${params.message}\n\nInitial todo list:\n${params.todos}`
      }

      // Create a new session for the task
      const session = await Session.create({
        parentID: ctx.sessionID,
        title: `New task (@${agent.name})`,
      })

      ctx.metadata({
        title: `New ${params.mode} task`,
        metadata: {
          success: true,
          requestedMode: params.mode,
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")

      // Handle abort
      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))

      // Execute the task
      const promptParts = await SessionPrompt.resolvePromptParts(fullPrompt)

      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        parts: promptParts,
      })

      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = [
        `task_id: ${session.id}`,
        "",
        "<task_result>",
        text,
        "</task_result>",
      ].join("\n")

      return {
        title: `New ${params.mode} task`,
        output,
        metadata: {
          success: true,
          requestedMode: params.mode,
          sessionId: session.id,
        },
      }
    },
  }
})
