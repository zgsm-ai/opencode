import { Tool } from "./tool"
import DESCRIPTION from "./sub_coding.txt"
import SUB_CODING_PROMPT_TEMPLATE from "../costrict/agent/sub-coding.txt"
import z from "zod"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { LLM } from "@/session/llm"
import { PermissionNext } from "@/permission/next"
import { defer } from "@/util/defer"
import path from "path"
import { fileURLToPath } from "url"
import { Log } from "@/util/log"
import { Bus } from "../bus"
import { ConfigMarkdown } from "@/config/markdown"
import { $ } from "bun"

// Logger for SubCodingTool - writes to file instead of console
const subCodingLogger = Log.create({ service: "sub_coding" })

// Sub-task schema for structured task definition
const SubTaskSchema = z.object({
  id: z.string().describe("Task identifier, e.g., '1.2'"),
  title: z.string().describe("One-line summary of the task"),
  detail: z.string().describe("Detailed description of what needs to be done"),
})

// Main parameters schema with strict validation
const parameters = z.object({
  important_note: z
    .string()
    .describe(
      "来自主 CodingAgent 给 SubCodingAgent 的关键补充说明。\n" +
        "用于传递在编码过程中发现的高价值、执行关键信息，例如：\n" +
        "- 之前遇到的已知陷阱/bug，以及如何避免\n" +
        "- 编码约束、边界情况\n" +
        "- 已知的环境缺失情况\n\n" +
        "与其他字段的关系：\n"+
        "- important_note：\"编码过程中学到的、不能遗漏的重要事项\"\n"+
        "- previous_work_summary：\"之前的 SubCodingAgent 已更改的内容\"\n"+
        "保持简洁但明确。"
    ),
  previous_work_summary: z
    .string()
    .describe(
      "之前 SubCodingAgent 完成的工作摘要。仅包含影响当前任务的内容：" +
        "- 已完成的内容及位置（文件/模块）\n" +
        "- 当前任务依赖的关键 API/行为更改。\n" +
        "不要添加新的推测性想法（将其放入 important_note）。" +
        "如果这是第一个 SubCodingAgent，使用：'None - this is the first SubCodingAgent'。"
    ),
  sub_tasks: z
    .array(SubTaskSchema)
    .describe(
      "分配给此 SubCodingAgent 的结构化任务列表。格式：array<{id, title, detail}>。" 
    ),
  agent_code: z
    .string()
    .describe(
      "此 SubCodingAgent 的唯一标识符（例如 'SubCodingAgent-1'）。" +
      "用作 agent-git 提交作者。每次新的 SubCodingAgent 调用必须递增。"
    ),
})

// Format sub-tasks into markdown checklist
function formatSubTasks(subTasks: z.infer<typeof parameters>["sub_tasks"]): string {
  return subTasks
    .map((task) => {
      const header = `- [ ] ${task.id} ${task.title}`
      const detailLines = task.detail
        .split("\n")
        .map((line) => `  - ${line}`)
        .join("\n")
      return `${header}\n${detailLines}`
    })
    .join("\n")
}

// Build the structured prompt for SubCodingAgent (task context only)
function buildPrompt(params: z.infer<typeof parameters>, root: string): string {
  const subTasksMarkdown = formatSubTasks(params.sub_tasks)

  return `## 任务上下文

项目路径: \`${root}\`

### 关键补充说明
${params.important_note}

### 历史工作摘要
${params.previous_work_summary}

### 你被分配的任务
${subTasksMarkdown}

请认真完成本次编码任务，编写高质量的代码`
}

// Render SubCodingAgent prompt template with variables
async function renderSubCodingPrompt(
  template: string,
  variables: { agent_code: string; tool_call_budget: string; budget_warning_threshold: string }
): Promise<string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../costrict/agent")
  const md = await ConfigMarkdown.parseString(template, {
    context: variables,
    baseDir: root,
    enableIncludes: true,
    enableVariables: true,
    enableConditionals: true,
  })
  return md?.content.trim() || template
}

async function getAgentGitStats(agentCode: string, projectPath: string) {
  const env = {
    ...process.env,
    GIT_DIR: path.join(projectPath, ".agent-git"),
    GIT_WORK_TREE: projectPath,
  }

  const logResult = await $`git log --author=${agentCode} --oneline`
    .cwd(projectPath)
    .env(env)
    .quiet()
    .nothrow()
  const logText = (await logResult.text()).trim()
  const commits = logText.length > 0 ? logText.split("\n").filter((line) => line.trim().length > 0) : []

  const filesResult = await $`git log --author=${agentCode} --name-only --pretty=format:`
    .cwd(projectPath)
    .env(env)
    .quiet()
    .nothrow()
  const filesText = (await filesResult.text()).trim()
  const files = filesText.length
    ? [...new Set(filesText.split("\n").map((file) => file.trim()).filter((file) => file.length > 0))].sort()
    : []

  return {
    commitCount: commits.length,
    files,
  }
}

function formatGitStats(stats: { commitCount: number; files: string[] }): string {
  const lines = [
    `- Made ${stats.commitCount} agent-git commit(s)`,
    `- Modified ${stats.files.length} file(s)`,
  ]

  if (stats.files.length > 0) {
    lines.push("- Modified files:")
    stats.files.forEach((file, index) => {
      lines.push(`  ${index + 1}. ${file}`)
    })
  }

  return lines.join("\n")
}

export const SubCodingTool = Tool.define("sub_coding", async (ctx) => {
  const subAgent = await Agent.get("SubCodingAgent").catch(() => null)
  const budget = subAgent?.budgetSteps ?? 70
  const description = DESCRIPTION.replace("{{budget}}", budget.toString())

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      subCodingLogger.info(`Starting ${params.agent_code}`)
      
      // Get the SubCodingAgent configuration
      const agent = await Agent.get("SubCodingAgent")
      if (!agent) {
        throw new Error(
          'SubCodingAgent not found. Make sure the agent is properly configured.',
        )
      }
      subCodingLogger.info(`Agent config loaded: ${agent.name}`)

      // Create a child session for SubCodingAgent
      subCodingLogger.info(`Creating child session with parent: ${ctx.sessionID}`)
      const session = await Session.create({
        parentID: ctx.sessionID,
        title: `${params.agent_code}: ${params.sub_tasks.map((t) => t.title).join(", ")}`,
        permission: [
          {
            permission: "todowrite",
            pattern: "*",
            action: "deny",
          },
          {
            permission: "todoread",
            pattern: "*",
            action: "deny",
          },
          {
            permission: "task" as const,
            pattern: "*" as const,
            action: "deny" as const,
          },
        ],
      })
      subCodingLogger.info(`Session created: ${session.id}`)
      const parentAgent = LLM.normalizeTrajectoryAgentName(ctx.agent)
      const subCode = params.agent_code.trim() || "SubCodingAgent"
      const trajectoryAgent = `${parentAgent}-${subCode}`
      LLM.setTrajectoryAgentAlias(session.id, trajectoryAgent)
      using __ = defer(() => LLM.clearTrajectoryAgentAlias(session.id))

      // Build the structured prompt
      const root = session.directory
      const prompt = buildPrompt(params, root)

      // Get the current message to extract model info
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") {
        throw new Error("Not an assistant message")
      }

      // Use agent's configured model or fallback to parent's model
      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      // Render SubCodingAgent system prompt from sub-coding.txt
      subCodingLogger.info(`Rendering SubCodingAgent prompt for: ${params.agent_code}`)
      const agentPrompt = await renderSubCodingPrompt(SUB_CODING_PROMPT_TEMPLATE, {
        agent_code: params.agent_code,
        tool_call_budget: agent.budgetSteps?.toString() || "70",
        budget_warning_threshold: agent.warningThreshold?.toString() || "20",
      })
      subCodingLogger.info(`SubCodingAgent prompt rendered, length: ${agentPrompt.length}`)

      // Inject prompt into agent (this modifies the cached agent object)
      // This ensures when Agent.get("SubCodingAgent") is called in the loop, it returns the rendered prompt
      agent.prompt = agentPrompt

      // Report metadata about the sub-agent session
      ctx.metadata({
        title: params.agent_code,
        metadata: {
          description: `${params.agent_code} - ${params.sub_tasks.length} tasks`,
          sessionId: session.id,
          agentCode: params.agent_code,
          taskCount: params.sub_tasks.length,
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
          title: params.agent_code,
          metadata: {
            description: `${params.agent_code} - ${params.sub_tasks.length} tasks`,
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
            agentCode: params.agent_code,
            taskCount: params.sub_tasks.length,
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

      // Execute the SubCodingAgent
      subCodingLogger.info(`Executing SessionPrompt.prompt for session: ${session.id}`)
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
        subCodingLogger.info(`SessionPrompt.prompt completed, result parts: ${result.parts.length}`)

        unsub()

        // Get final messages to summarize what was done
        const messages = await Session.messages({ sessionID: session.id })
        const allToolParts = messages
          .filter((message) => message.info.role === "assistant")
          .flatMap(
            (message) =>
              message.parts.filter((part: any) => part.type === "tool") as MessageV2.ToolPart[],
          )

        const summary = allToolParts.map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))

        const exitPart = allToolParts.findLast(
          (part) => part.tool === "sub_agent_task_done" && part.state.status === "completed",
        )
        const success = exitPart !== undefined

        // Read the original direct_response from tool input, not from tool output text.
        const directResponse = (() => {
          if (!exitPart || exitPart.state.status !== "completed") return ""
          const input = exitPart.state.input
          if (!input || typeof input !== "object") return ""
          const direct = (input as Record<string, unknown>).direct_response
          if (typeof direct !== "string") return ""
          return direct.trim()
        })()

        const gitStats = await getAgentGitStats(params.agent_code, root).catch(() => ({
          commitCount: 0,
          files: [],
        }))
        const gitStatsStr = formatGitStats(gitStats)

        const metadata = {
          description: `${params.agent_code} - ${params.sub_tasks.length} tasks`,
          summary,
          sessionId: session.id,
          agentCode: params.agent_code,
          taskCount: params.sub_tasks.length,
          model,
        }

        if (success && directResponse) {
          return {
            title: params.agent_code,
            metadata,
            output: `## ${params.agent_code} Completed Assigned Tasks

### SubCodingAgent Feedback
${directResponse}

### agent-git Statistics
${gitStatsStr}

**Next Steps**: Carefully review the code changes above and verify the implementation has no issues, then update task.md to mark completed tasks as [x].`,
          }
        }

        const lastText = result.parts.findLast((part) => part.type === "text")?.text ?? ""
        const sessionError = result.info.role === "assistant" ? result.info.error : undefined
        const errorMsg = sessionError
          ? [sessionError.name, (sessionError as any).message].filter(Boolean).join(": ")
          : ""
        const failureReason = (() => {
          if (success && !directResponse) return "sub_agent_task_done was called but direct_response was missing"
          return lastText || errorMsg || "Unknown error"
        })()

        throw new Error(`## ${params.agent_code} Task Execution Failed

### Failure Reason
${failureReason}

### agent-git Statistics
${gitStatsStr}

**Recommended Actions**:
1. Use \`agent-git log --author="${params.agent_code}"\` to check what was committed
2. If needed, use \`agent-git revert <commit-id>\` to rollback changes
3. Analyze the failure reason and reassign tasks to a new SubCodingAgent`)
      } catch (error) {
        unsub()
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

      return `SubCoding tool validation failed. Please provide all required parameters:\n${issues}\n\nRequired parameters:\n  - important_note: Critical notes from CodingAgent\n  - previous_work_summary: Summary of previous work\n  - sub_tasks: Array of tasks with id, title, and detail\n  - agent_code: Unique identifier (e.g., "SubCodingAgent-1")`
    },
  }
})
