import { Tool } from "./tool"
import DESCRIPTION from "./quick_explore.txt"
import z from "zod"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
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
          // Disable write operations (read-only)
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

      // 3. Build exploration prompt
      const prompt = `## 探索任务

探索目标: ${params.exploration_target}

请完成本次探索任务，提供结构化的探索结果。

重要提醒：
- 如果你连续 10 轮仅使用 bash 执行 rg/fd 搜索，必须使用 sequentialthinking 工具进行反思
- 如果你连续 6 轮使用 view 工具查看同一文件，必须使用 sequentialthinking 工具进行反思
- 只读不写，禁止修改任何代码
- 完成探索后，调用 sub_agent_task_done 工具返回结果`

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

        // 8. Extract result
        const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

        return {
          title: "QuickExploreAgent",
          metadata: {
            description: params.exploration_target.substring(0, 100),
            summary,
            sessionId: session.id,
            model,
          },
          output:
            text +
            "\n\n" +
            ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n"),
        }
      } catch (error) {
        unsub()
        quickExploreLogger.error(`SessionPrompt.prompt failed: ${error}`)
        throw error
      }
    },
    // Custom error formatter for Zod validation errors
    formatValidationError(error: z.ZodError): string {
      const issues = error.issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "root"
          return `  - ${path}: ${issue.message}`
        })
        .join("\n")

      return `QuickExplore tool validation failed. Please provide all required parameters:\n${issues}\n\nRequired parameters:\n  - exploration_target: 单个、具体的探索/代码定位请求`
    },
  }
})
