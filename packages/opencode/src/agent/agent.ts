import { Config } from "../config/config"
import { ConfigMarkdown } from "../config/markdown"
import z from "zod"
import { Provider } from "../provider/provider"
import { generateObject, streamObject, type ModelMessage } from "ai"
import { SystemPrompt } from "../session/system"
import { Instance } from "../project/instance"
import { TestGuide } from "../util/testGuideDiscovery"
import { Auth } from "../auth"
import { ProviderTransform } from "../provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import PROMPT_PROPOSAL from "../costrict/agent/proposal.txt"
import PROMPT_TASKCHECK from "../costrict/agent/task-check.txt"
import PROMPT_CODING from "../costrict/agent/coding.txt"
import PROMPT_QUICK_EXPLORE from "../costrict/agent/quick-explore.txt"
import PROMPT_FIX from "../costrict/agent/fix-agent.txt"
import { PermissionNext } from "@/permission/next"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@/global"
import path from "path"
import { Plugin } from "@/plugin"
import { fileURLToPath } from "url"
import { AgentToolsConfig } from "@/costrict/agent/config"
import { COMPONENTS } from "@/costrict/agent/components"

export namespace Agent {
  const USER_VISIBLE_AGENT_KEYS = new Set(["proposal", "taskcheck", "coding", "FixAgent"])

  /**
   * Agent options 类型定义
   * 可以通过扩展此接口来添加自定义选项
   */
  export interface Options {
    /**
     * 指定用于标记任务完成的工具名称
     * 默认为 "task_done"
     *
     * 示例：对于 build agent，可以设置为 "new_task_done"
     */
    exitToolName?: string

    /**
     * 强制思考检查函数
     * 用于判断是否需要强制只使用 sequentialthinking 工具
     *
     * @param context - 包含当前会话的所有上下文信息
     * @returns 如果需要强制思考，返回提醒消息；否则返回 null
     *
     * 示例：
     * ```typescript
     * forcedSequentialThinking: (context) => {
     *   if (context.consecutiveToolFailures > 3) {
     *     return "检测到连续工具调用失败，请先使用 sequentialthinking 工具重新分析问题。"
     *   }
     *   return null
     * }
     * ```
     */
    forcedSequentialThinking?: (context: ForcedThinkingContext) => string | null

    [key: string]: any
  }

  /**
   * 强制思考检查的上下文信息
   */
  export interface ForcedThinkingContext {
    sessionID: string
    messages: any[]  // 完整的消息历史
    lastAssistant?: any  // 最后一条 assistant 消息
    toolParts: any[]  // 当前的工具调用列表
  }

  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]),
      native: z.boolean().optional(),
      hidden: z.boolean().optional(),
      topP: z.number().optional(),
      temperature: z.number().optional(),
      color: z.string().optional(),
      permission: PermissionNext.Ruleset,
      model: z
        .object({
          modelID: z.string(),
          providerID: z.string(),
        })
        .optional(),
      prompt: z.string().optional(),
      options: z.record(z.string(), z.any()),
      // steps: outer loop max (max_steps)
      steps: z.number().int().positive().optional(),
      // budgetSteps: tool-call budget for agents that use it (e.g. QuickExplore/SubCodingAgent)
      budgetSteps: z.number().int().positive().optional(),
      warningThreshold: z.number().int().nonnegative().optional(),
    })
    .meta({
      ref: "Agent",
    })
  export type Info = z.infer<typeof Info>

  const state = Instance.state(async () => {
    const cfg = await Config.get()
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../costrict/agent")
    const promptContext = (options?: Record<string, unknown>) => {
      const base = options ?? {}
      const levelRaw = base["interaction_level"]
      const level = typeof levelRaw === "string" ? levelRaw : undefined
      const detailed = base["interaction_level_detailed"] === true || level === "detailed"
      const minimal = base["interaction_level_minimal"] === true || level === "minimal"
      const moderate = base["interaction_level_moderate"] === true || level === "moderate" || (!detailed && !minimal)
      return {
        ...base,
        interaction_level_detailed: detailed,
        interaction_level_moderate: moderate,
        interaction_level_minimal: minimal,
      }
    }
    const render = async (text: string, options?: Record<string, unknown>) => {
      const md = await ConfigMarkdown.parseString(text, {
        context: promptContext(options),
        baseDir: root,
        components: COMPONENTS,
        enableIncludes: true,
        enableVariables: true,
        enableConditionals: true,
      }).catch(() => undefined)
      if (!md) return text
      return md.content.trim()
    }
    const proposal = await render(PROMPT_PROPOSAL, cfg.agent?.proposal?.options)
    const taskcheck = await render(PROMPT_TASKCHECK, cfg.agent?.taskcheck?.options)
    const coding = await render(PROMPT_CODING, cfg.agent?.coding?.options)
    const quick = await render(PROMPT_QUICK_EXPLORE, cfg.agent?.QuickExplore?.options)
    const fix = await render(PROMPT_FIX, cfg.agent?.FixAgent?.options)

    const defaults = PermissionNext.fromConfig({
      "*": "deny",  // 默认拒绝所有工具
      doom_loop: "ask",
      external_directory: "ask",
      read: {
        "*": "allow",
        "*.memory_bank.md": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
      edit: {
        "*.memory_bank.md": "allow",
      },
    })
    const user = PermissionNext.fromConfig(cfg.permission ?? {})
    // str_replace_based_edit_tool internally asks read/edit/external_directory permissions.
    // Keep these explicitly allowed so the unified edit tool is never blocked by legacy denies.
    const editor = PermissionNext.fromConfig({
      str_replace_based_edit_tool: "allow",
      read: "allow",
      edit: {
        "*": "ask",
        "*.memory_bank.md": "allow",
      },
      external_directory: "ask",
    })
    const proposalAutoAllow = PermissionNext.fromConfig({
      edit: {
        "*proposal.md": "allow",
        "*clarify.md": "allow",
        "*task.md": "allow",
      },
    })
    const exploreAutoAllow = PermissionNext.fromConfig({
      edit: {
        "*explore.md": "allow",
      },
    })
    const permitEditor = (ruleset: PermissionNext.Ruleset) => PermissionNext.merge(ruleset, editor)

    const result: Record<string, Info> = {
      build: {
        name: "build",
        description: "The default agent. Executes tools based on configured permissions.",
        options: {},
        permission: permitEditor(PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
            task_done: "allow",
          }),
          user,
          PermissionNext.fromConfig({
            sub_agent_task_done: "deny",
            task_done_with_change_id: "deny",
          }),
        )),
        mode: "primary",
        native: true,
      },
      plan: {
        name: "plan",
        description: "Plan mode. Disallows all edit tools.",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_exit: "allow",
            external_directory: {
              [path.join(Global.Path.data, "plans", "*")]: "allow",
            },
            edit: {
              "*": "deny",
              [path.join("..costrict", "plans", "*.md")]: "allow",
              [path.relative(Instance.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
            },
          }),
          user,
        ),
        mode: "primary",
        native: true,
      },
      proposal: {
        name: "proposal",
        description: "Creates detailed technical change proposals and architectural designs. Researches codebase, designs solutions, and produces structured proposal documents without implementing code.",
        options: {
          exitToolName: "task_done_with_change_id",  // ✅ 正确的退出工具
        },
        // No steps limit for proposal agent
        permission: PermissionNext.merge(
          permitEditor(
            PermissionNext.merge(
              defaults,
              AgentToolsConfig.createToolPermission(
                AgentToolsConfig.AGENT_CONFIGS.proposal.tools
              ),
              user,
            ),
          ),
          proposalAutoAllow,
        ),
        mode: "primary",
        native: true,
        prompt: proposal,
      },
      taskcheck: {
        name: "taskcheck",
        description: "Task quality checking and improvement agent. Checks if tasks in task.md are clear, precise, and complete. Verifies requirements coverage, code location precision, and style consistency. Can only modify task.md, not code files.",
        options: {
          exitToolName: AgentToolsConfig.AGENT_CONFIGS.taskcheck.exitToolName,
        },
        permission: PermissionNext.merge(
          permitEditor(PermissionNext.merge(
            defaults,
            AgentToolsConfig.createToolPermission(
              AgentToolsConfig.AGENT_CONFIGS.taskcheck.tools
            ),
            user,
          )),
          proposalAutoAllow,
        ),
        mode: "primary",
        native: true,
        hidden: true,
        prompt: taskcheck,
      },
      coding: {
        name: "coding",
        description: "软件开发团队的项目管理者和技术架构师。负责理解任务规划(task.md),将开发任务分发给 SubCodingAgent 执行,审查代码提交,追踪进度。不直接修改代码,通过分发任务推动项目进展。",
        options: {
          exitToolName: AgentToolsConfig.AGENT_CONFIGS.coding.exitToolName,
        },
        permission: PermissionNext.merge(
          permitEditor(PermissionNext.merge(
            defaults,
            AgentToolsConfig.createToolPermission(
              AgentToolsConfig.AGENT_CONFIGS.coding.tools
            ),
            user,
          )),
          proposalAutoAllow,
        ),
        mode: "primary",
        native: true,
        prompt: coding,
      },
      FixAgent: {
        name: "FixAgent",
        description: "代码修复和改进专家。收集用户反馈，分析问题，制定修改策略，委托SubCodingAgent执行代码修改。",
        options: {
          exitToolName: AgentToolsConfig.AGENT_CONFIGS.FixAgent.exitToolName,
        },
        permission: PermissionNext.merge(
          permitEditor(PermissionNext.merge(
            defaults,
            AgentToolsConfig.createToolPermission(
              AgentToolsConfig.AGENT_CONFIGS.FixAgent.tools
            ),
            user,
          )),
          proposalAutoAllow,
        ),
        mode: "primary",
        native: true,
        prompt: fix,
        color: "#ff4444",
      },
      general: {
        name: "general",
        description: `General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.`,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            todoread: "deny",
            todowrite: "deny",
          }),
          user,
        ),
        options: {},
        mode: "subagent",
        native: true,
      },
      explore: {
        name: "explore",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            bash: "allow",
            webfetch: "allow",
            websearch: "allow",
            codesearch: "allow",
            read: "allow",
          }),
          user,
        ),
        description: `Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.`,
        prompt: PROMPT_EXPLORE,
        options: {},
        mode: "subagent",
        native: true,
      },
      compaction: {
        name: "compaction",
        mode: "primary",
        native: true,
        hidden: true,
        prompt: PROMPT_COMPACTION,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        options: {},
      },
      title: {
        name: "title",
        mode: "primary",
        options: {},
        native: true,
        hidden: true,
        temperature: 0.5,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        prompt: PROMPT_TITLE,
      },
      summary: {
        name: "summary",
        mode: "primary",
        options: {},
        native: true,
        hidden: true,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
          }),
          user,
        ),
        prompt: PROMPT_SUMMARY,
      },
      QuickExplore: {
        name: "QuickExplore",
        description: "Fast agent specialized for exploring codebases and locating code. Used by other agents via quick_explore tool to find specific implementations, registrations, or call chains.",
        options: {
          exitToolName: "sub_agent_task_done",
          forcedSequentialThinking: (context: Agent.ForcedThinkingContext) => {
            const SEARCH_BREAK_THRESHOLD = 10
            const VIEW_BREAK_THRESHOLD = 6

            // Helper: Check if tool call is bash command with rg/fd/fdfind
            const isBashRgFdCall = (toolPart: any) => {
              if (toolPart.tool !== "bash") return false
              const command = toolPart.state?.input?.command
              if (!command || typeof command !== "string") return false
              return /\b(rg|fd|fdfind)\b/i.test(command)
            }

            // Helper: Check if tool call is str_replace_based_edit_tool with view command
            const isViewCall = (toolPart: any) => {
              if (toolPart.tool !== "str_replace_based_edit_tool") return false
              const command = toolPart.state?.input?.command
              return command === "view"
            }

            // Helper: Extract file path from view call
            const getViewFilePath = (toolPart: any): string | null => {
              if (!isViewCall(toolPart)) return null
              const path = toolPart.state?.input?.path
              return typeof path === "string" ? path : null
            }

            // Check for consecutive view calls on the same file
            if (context.messages.length >= VIEW_BREAK_THRESHOLD) {
              // Get recent assistant messages with tools
              const recentAssistants = context.messages
                .filter(m => m.info?.role === "assistant")
                .slice(-VIEW_BREAK_THRESHOLD)

              // Check if all recent messages only have view calls
              const allViewOnly = recentAssistants.every(msg => {
                const parts = msg.parts || []
                const toolParts = parts.filter((p: any) => p.type === "tool")
                if (toolParts.length === 0) return false
                return toolParts.every(isViewCall)
              })

              if (allViewOnly) {
                // Extract file paths from all view calls
                const filePaths: string[] = []
                for (const msg of recentAssistants) {
                  const parts = msg.parts || []
                  const toolParts = parts.filter((p: any) => p.type === "tool")
                  for (const toolPart of toolParts) {
                    const filePath = getViewFilePath(toolPart)
                    if (filePath) filePaths.push(filePath)
                  }
                }

                // Check if all paths are the same
                if (filePaths.length > 0) {
                  const firstPath = filePaths[0]
                  if (filePaths.every(p => p === firstPath)) {
                    return (
                      `你已经连续 6 轮使用 str_replace_based_edit_tool:view 工具查看同一个文件了（${firstPath}）。` +
                      "为了避免盲目地查看整个文件，请你这一轮必须使用 sequential-thinking 工具进行反思:\n" +
                      "1. 明确你要在这个文件中查找什么内容或理解什么逻辑\n" +
                      "2. 先使用 file_outline 工具查看文件大纲，了解文件的结构和主要函数/类\n" +
                      "3. 基于文件大纲，确定需要查看的具体代码范围（函数、类或代码段）\n" +
                      "4. 使用 str_replace_based_edit_tool:view 时指定 view_range 参数，只查看相关的代码范围\n" +
                      "5. 不要盲目地 view 整个文件，应该有针对性地查看特定部分，因为目标文件可能有上万行代码，盲目地 view 整个文件会浪费大量时间"
                    )
                  }
                }
              }
            }

            // Check for consecutive search-only steps (bash+rg/fd)
            if (context.messages.length >= SEARCH_BREAK_THRESHOLD) {
              // Get recent assistant messages with tools
              const recentAssistants = context.messages
                .filter(m => m.info?.role === "assistant")
                .slice(-SEARCH_BREAK_THRESHOLD)

              // Check if all recent messages only have bash+rg/fd calls
              const allSearchOnly = recentAssistants.every(msg => {
                const parts = msg.parts || []
                const toolParts = parts.filter((p: any) => p.type === "tool")
                if (toolParts.length === 0) return false
                return toolParts.every(isBashRgFdCall)
              })

              if (allSearchOnly) {
                return (
                  "你已经连续 10 轮仅使用 bash 执行 rg/fd 搜索了。" +
                  "为了避免再次陷入死循环,请你这一轮必须使用 sequential-thinking 工具进行反思:\n" +
                  "1. 明确你要找的符号/字符串是什么\n" +
                  "2. 分析为什么前面的搜索没有找到目标\n" +
                  "3. 缩小目录范围或调整搜索策略\n" +
                  "4. 目标定义是否还没有在项目中实现，这是否是一个需要从头开始实现的新定义\n" +
                  "5. 制定接下来 1-3 步最有效的定位计划"
                )
              }
            }

            return null
          },
        },
        // steps: outer loop max, budgetSteps: tool-call budget for QuickExplore agent
        steps: 500,
        budgetSteps: 60,
        warningThreshold: 10,  // Warn when budget is low (≤10)
        permission: PermissionNext.merge(
          permitEditor(PermissionNext.merge(
            defaults,
            AgentToolsConfig.createToolPermission(
              AgentToolsConfig.AGENT_CONFIGS.QuickExplore.tools
            ),
            user,
          )),
          exploreAutoAllow,
        ),
        mode: "subagent",
        native: true,
        hidden: true,
        prompt: quick,
      },
    }

    for (const [key, value] of Object.entries(cfg.agent ?? {})) {
      if (value.disable) {
        delete result[key]
        continue
      }
      let item = result[key]
      if (!item)
        item = result[key] = {
          name: key,
          mode: "all",
          permission: PermissionNext.merge(defaults, user),
          options: {},
          native: false,
        }
      if (value.model) item.model = Provider.parseModel(value.model)
      item.prompt = value.prompt ?? item.prompt
      item.description = value.description ?? item.description
      item.temperature = value.temperature ?? item.temperature
      item.topP = value.top_p ?? item.topP
      item.mode = value.mode ?? item.mode
      item.color = value.color ?? item.color
      item.hidden = value.hidden ?? item.hidden
      item.name = value.name ?? item.name
      item.steps = value.steps ?? item.steps
      // Allow config to override tool-call budget for agents that use it
      // Config.Agent transform injects budgetSteps when budget_steps/steps are configured.
      item.budgetSteps = (value as any).budgetSteps ?? item.budgetSteps
      item.warningThreshold = value.warningThreshold ?? item.warningThreshold
      item.options = mergeDeep(item.options, value.options ?? {})
      item.permission = PermissionNext.merge(item.permission, PermissionNext.fromConfig(value.permission ?? {}))
    }

    // Ensure SubCodingAgent is defined with proper budget settings
    if (!result["SubCodingAgent"]) {
      result["SubCodingAgent"] = {
        name: "SubCodingAgent",
        description: "Sub-agent for executing coding tasks. Distributed by CodingAgent to implement specific code changes.",
        options: {
          exitToolName: "sub_agent_task_done",
        },
        // steps: outer loop max, budgetSteps: tool-call budget for SubCodingAgent
        steps: 500,
        budgetSteps: 80,
        warningThreshold: 20,  // Warn when budget is low (≤20)
        permission: PermissionNext.merge(
          permitEditor(PermissionNext.merge(
            defaults,
            AgentToolsConfig.createToolPermission(
              AgentToolsConfig.AGENT_CONFIGS.SubCodingAgent.tools
            ),
            user,
          )),
          proposalAutoAllow,
        ),
        mode: "subagent",
        native: true,
        hidden: true,
      }
    }

    for (const [key, item] of Object.entries(result)) {
      const visible = USER_VISIBLE_AGENT_KEYS.has(key)
      item.hidden = !visible
      if (visible) item.mode = "primary"
    }

    return result
  })

  export async function get(agent: string) {
    return state().then((x) => x[agent])
  }

  export async function list() {
    const cfg = await Config.get()
    const def = cfg.default_agent ?? "proposal"
    return pipe(
      await state(),
      values(),
      sortBy([(x) => x.name === def, "desc"]),
    )
  }

  export async function defaultAgent() {
    const cfg = await Config.get()
    const agents = await state()

    if (cfg.default_agent) {
      const agent = agents[cfg.default_agent]
      if (agent && agent.mode !== "subagent" && agent.hidden !== true) return agent.name
    }

    const primaryVisible = Object.values(agents).find(
      (a) => a.mode !== "subagent" && a.hidden !== true && a.native === true,
    )
    if (!primaryVisible) throw new Error("no primary visible agent found")
    return primaryVisible.name
  }

  export async function generate(input: { description: string; model?: { providerID: string; modelID: string } }) {
    const cfg = await Config.get()
    const defaultModel = input.model ?? (await Provider.defaultModel())
    const model = await Provider.getModel(defaultModel.providerID, defaultModel.modelID)
    const language = await Provider.getLanguage(model)

    const system = [PROMPT_GENERATE]
    await Plugin.trigger("experimental.chat.system.transform", { model }, { system })
    const existing = await list()

    const params = {
      experimental_telemetry: {
        isEnabled: cfg.experimental?.openTelemetry,
        metadata: {
          userId: cfg.username ?? "unknown",
        },
      },
      temperature: 0.3,
      messages: [
        ...system.map(
          (item): ModelMessage => ({
            role: "system",
            content: item,
          }),
        ),
        {
          role: "user",
          content: `Create an agent configuration based on this request: \"${input.description}\".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
        },
      ],
      model: language,
      schema: z.object({
        identifier: z.string(),
        whenToUse: z.string(),
        systemPrompt: z.string(),
      }),
    } satisfies Parameters<typeof generateObject>[0]

    if (defaultModel.providerID === "openai" && (await Auth.get(defaultModel.providerID))?.type === "oauth") {
      const result = streamObject({
        ...params,
        providerOptions: ProviderTransform.providerOptions(model, {
          instructions: SystemPrompt.instructions(),
          store: false,
        }),
        onError: () => {},
      })
      for await (const part of result.fullStream) {
        if (part.type === "error") throw part.error
      }
      return result.object
    }

    const result = await generateObject(params)
    return result.object
  }
}
