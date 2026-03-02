import { Tool } from "./tool"
import DESCRIPTION from "./quick_explore.txt"
import z from "zod"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { LLM } from "@/session/llm"
import { defer } from "@/util/defer"
import { Log } from "@/util/log"
import { Bus } from "../bus"

// Logger for QuickExploreTool - writes to file instead of console
const quickExploreLogger = Log.create({ service: "quick_explore" })

// Strict parameter schema following Python implementation
const parameters = z.object({
  exploration_target: z.string().min(1, "exploration_target cannot be empty").describe(
    "单个、具体的探索/代码定位请求。\n" +
    "仅在你不知道目标文件/路径时使用此工具（或需要跨模块的入口点/注册/调用链证据）。\n" +
    "如果目标文件位置已知，不要调用此工具；而是直接读取/概览已知文件。\n\n" +
    "编写方式应使 agent 能可靠地搜索：\n" +
    "- 如已知，包含精确符号（函数/类/模块名）\n" +
    "- 如相关，包含精确字符串（UI 文本、错误消息、配置键、路由路径）\n" +
    "- 包含期望的输出形式（例如\"返回文件路径 + 符号名 + 关键证据\"）\n\n" +
    "好的示例：\n" +
    "- \"定位 'execute_quick_explore_task' 在哪里注册以及它如何创建 QuickExploreAgent。返回文件路径 + 关键函数。\"\n" +
    "- \"查找路由 '/api/v1/login'（或类似）的处理器。提供入口点注册和最终处理器实现。\"\n" +
    "- \"搜索错误消息 'Git Bash not found on Windows system' 并定位引发它的代码。\"\n" +
    "- \"QuickExploreAgent 类在哪里定义，它如何加载提示模板？\"\n\n" +
    "差的示例：\n" +
    "- \"打开文件 X 并更改 Y\"（路径已知；这不是探索）\n" +
    "- \"探索项目\"（太宽泛）\n" +
    "- \"查找 auth\"（太模糊）"
  ),
})

export const QuickExploreTool = Tool.define("quick_explore", async (ctx) => {
  return {
    description: DESCRIPTION,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      quickExploreLogger.info(`Starting QuickExploreAgent`)

      // 1. Get QuickExploreAgent configuration
      const agent = await Agent.get("QuickExplore")
      if (!agent) {
        throw new Error(
          "QuickExploreAgent not found. Make sure the agent is properly configured."
        )
      }
      quickExploreLogger.info(`Agent config loaded: ${agent.name}`)

      // 2. Create child session with read-only permissions
      quickExploreLogger.info(`Creating child session with parent: ${ctx.sessionID}`)
      const session = await Session.create({
        parentID: ctx.sessionID,
        title: `QuickExplore: ${params.exploration_target.substring(0, 50)}...`,
        permission: [
          // Deny all write operations by default
          {
            permission: "edit" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "write" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "apply_patch" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          // Allow editing explore.md in any path (must come AFTER deny rules, findLast wins)
          {
            permission: "edit" as const,
            pattern: "**/explore.md" as const,
            action: "allow" as const,
          },
          // Disable todo tools
          {
            permission: "todowrite" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          {
            permission: "todoread" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
          // Disable task tool to prevent spawning sub-agents
          {
            permission: "task" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
        ],
      })
      quickExploreLogger.info(`Session created: ${session.id}`)
      const parentAgent = LLM.normalizeTrajectoryAgentName(ctx.agent)
      const trajectoryAgent = `${parentAgent}-QuickExploreAgent`
      LLM.setTrajectoryAgentAlias(session.id, trajectoryAgent)
      using __ = defer(() => LLM.clearTrajectoryAgentAlias(session.id))

      // 3. Build exploration prompt
      const root = session.directory
      const prompt = `项目路径: ${root}
探索目标: ${params.exploration_target}

请认真完成本次探索`

      // 4. Get model info from current message
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") {
        throw new Error("Not an assistant message")
      }

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      // 5. Report metadata
      ctx.metadata({
        title: "QuickExploreAgent",
        metadata: {
          description: params.exploration_target.substring(0, 100),
          sessionId: session.id,
          model,
        },
      })

      // Define messageID before subscribing to events
      const messageID = Identifier.ascending("message")

      // Track tool execution progress
      const parts: Record<
        string,
        { id: string; tool: string; state: { status: string; title?: string } }
      > = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: "QuickExploreAgent",
          metadata: {
            description: params.exploration_target.substring(0, 100),
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
            model,
          },
        })
      })

      // Handle cancellation
      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))

      // 6. Execute QuickExploreAgent
      quickExploreLogger.info(`Executing SessionPrompt.prompt for session: ${session.id}`)

      try {
        const result = await SessionPrompt.prompt({
          messageID,
          sessionID: session.id,
          agent: agent.name,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          tools: {
            todowrite: false,
            todoread: false,
            task: false,
          },
          parts: [
            {
              type: "text",
              text: prompt,
            },
          ],
        })

        quickExploreLogger.info(`SessionPrompt.prompt completed, result parts: ${result.parts.length}`)

        const sessionError = result.info.role === "assistant" ? result.info.error : undefined
        if (sessionError) {
          throw new Error([sessionError.name, (sessionError as any).message].filter(Boolean).join(": "))
        }

        unsub()

        // 7. Get final messages to summarize what was done
        const messages = await Session.messages({ sessionID: session.id })
        const summary = messages
          .filter((x) => x.info.role === "assistant")
          .flatMap(
            (msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[],
          )
          .map((part) => ({
            id: part.id,
            tool: part.tool,
            state: {
              status: part.state.status,
              title: part.state.status === "completed" ? part.state.title : undefined,
            },
          }))

        // 8. Read direct_response from sub_agent_task_done tool input
        // Use the latest completed call as final response source
        const subAgentTaskDonePart = result.parts.findLast(
          (part) => part.type === "tool" && part.tool === "sub_agent_task_done" && part.state?.status === "completed"
        ) as MessageV2.ToolPart | undefined

        let directResponse = ""
        if (subAgentTaskDonePart && subAgentTaskDonePart.state.status === "completed") {
          const input = subAgentTaskDonePart.state.input
          const direct =
            input && typeof input === "object" ? (input as Record<string, unknown>).direct_response : undefined
          if (typeof direct !== "string" || !direct.trim()) {
            throw new Error("sub_agent_task_done completed but direct_response was missing in tool input")
          }
          directResponse = direct.trim()

          // 清理不需要的内容：移除 budget_notice 和其他系统标签
          directResponse = directResponse
            .replace(/<tool_results_end\/>\s*/g, '')
            .replace(/<budget_notice>[\s\S]*?<\/budget_notice>/g, '')
            .trim()
        }

        // If sub_agent_task_done was not called, fall back to text content
        if (!subAgentTaskDonePart) {
          directResponse = result.parts.findLast((x) => x.type === "text")?.text ?? ""
        }

        return {
          title: "QuickExploreAgent",
          metadata: {
            description: params.exploration_target.substring(0, 100),
            summary,
            sessionId: session.id,
            model,
          },
          output: directResponse,
        }
      } catch (error) {
        unsub()
        quickExploreLogger.error(`SessionPrompt.prompt failed: ${error}`)
        throw new Error(
          `## QuickExploreAgent Analysis Failed\n\n` +
          `### Exploration Target\n${params.exploration_target}\n\n` +
          `### Failure Reason\n${error instanceof Error ? error.message : String(error)}\n\n` +
          `### Suggested Actions\n` +
          `1. Narrow the target: include exact symbols/strings (function/class names, error text, route path, config key)\n` +
          `2. Ask for the exact output form you want (file paths + symbols + key evidence lines)\n` +
          `3. If you saw a specific error text, include it verbatim to enable precise searching\n`
        )
      }
    },
    // Custom error formatter for Zod validation errors
    formatValidationError(_error: z.ZodError): string {
      return (
        "Missing or invalid 'exploration_target' parameter.\n\n" +
        "Provide a single, concrete code-locating request as a string.\n" +
        "Example: \"Find where class QuickExploreAgent is defined and how it loads the prompt template.\""
      )
    },
  }
})
