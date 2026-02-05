import { Config } from "../config/config"
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
import PROMPT_PROPOSAL from "./prompt/proposal.txt"
import PROMPT_TASKCHECK from "./prompt/taskcheck.txt"
import PROMPT_CODING from "./prompt/coding.txt"
import PROMPT_QUICK_EXPLORE from "../costrict/agent/quick-explore.txt"
import { PermissionNext } from "@/permission/next"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@/global"
import path from "path"
import { Plugin } from "@/plugin"

export namespace Agent {
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
     * 用于判断是否需要强制只使用 sequential-thinking 工具
     *
     * @param context - 包含当前会话的所有上下文信息
     * @returns 如果需要强制思考，返回提醒消息；否则返回 null
     *
     * 示例：
     * ```typescript
     * forcedSequentialThinking: (context) => {
     *   if (context.consecutiveToolFailures > 3) {
     *     return "检测到连续工具调用失败，请先使用 sequential-thinking 工具重新分析问题。"
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
      steps: z.number().int().positive().optional(),
    })
    .meta({
      ref: "Agent",
    })
  export type Info = z.infer<typeof Info>

  const state = Instance.state(async () => {
    const cfg = await Config.get()

    const defaults = PermissionNext.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      external_directory: {
        "*": "ask",
      },
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
    })
    const user = PermissionNext.fromConfig(cfg.permission ?? {})

    const result: Record<string, Info> = {
      build: {
        name: "build",
        description: "The default agent. Executes tools based on configured permissions.",
        options: {},
        steps: 60,  // 默认预算60次工具调用
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
          }),
          user,
        ),
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
          exitToolName: "task_done",
        },
        // No steps limit for proposal agent
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
            quick_explore: "allow",
            edit: {
              "*": "deny",
              "**/*.md": "allow",
              "**/proposal/**/*.md": "allow",
              "proposal/**/*.md": "allow",
            },
            write: {
              "*": "deny",
              "**/*.md": "allow",
              "proposal/**": "allow",
            },
          }),
          user,
        ),
        mode: "primary",
        native: true,
        prompt: PROMPT_PROPOSAL,
      },
      taskcheck: {
        name: "taskcheck",
        description: "Task quality checking and improvement agent. Checks if tasks in tasks.md are clear, precise, and complete. Verifies requirements coverage, code location precision, and style consistency. Can only modify tasks.md, not code files.",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            quick_explore: "allow",
            // Only allow editing tasks.md
            edit: {
              "*": "deny",
              "**/proposal/*/tasks.md": "allow",
              "proposal/*/tasks.md": "allow",
            },
            write: {
              "*": "deny",
            },
            // Allow bash for verification and exploration
            bash: "allow",
            // Allow reading any file for code exploration
            read: "allow",
            // Disable other edit tools
            apply_patch: "deny",
          }),
          user,
        ),
        mode: "primary",
        native: true,
        hidden: true,
        prompt: PROMPT_TASKCHECK,
      },
      coding: {
        name: "coding",
        description: "软件开发团队的项目管理者和技术架构师。负责理解任务规划(tasks.md),将开发任务分发给 SubCodingAgent 执行,审查代码提交,追踪进度。不直接修改代码,通过分发任务推动项目进展。",
        options: {},
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            // Only allow editing tasks.md
            edit: {
              "*": "deny",
              "**/proposal/*/tasks.md": "allow",
              "proposal/*/tasks.md": "allow",
            },
            // Deny write
            write: {
              "*": "deny",
            },
            // Allow bash for agent-git operations
            bash: "allow",
            // Allow reading any file
            read: "allow",
            // Allow starting sub agents
            task: "allow",
            // Allow using sub_coding tool (new structured way)
            sub_coding: "allow",
          }),
          user,
        ),
        mode: "primary",
        native: true,
        prompt: PROMPT_CODING,
        steps: 100,
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
        steps: 10,
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
        },
        steps: 8,  // Budget limit for QuickExplore agent
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            // Read-only permissions
            read: "allow",
            bash: "allow",
            str_replace_based_edit_tool: "allow",
            // Disable write operations
            edit: {
              "*": "deny",
            },
            write: {
              "*": "deny",
            },
            apply_patch: "deny",
            // Disable todo tools
            todowrite: "deny",
            todoread: "deny",
            // Disable spawning sub-agents
            task: "deny",
            sub_coding: "deny",
            quick_explore: "deny",
            // Disable question tool
            question: "deny",
          }),
          user,
        ),
        mode: "subagent",
        native: true,
        hidden: true,
        prompt: PROMPT_QUICK_EXPLORE,
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
      item.options = mergeDeep(item.options, value.options ?? {})
      item.permission = PermissionNext.merge(item.permission, PermissionNext.fromConfig(value.permission ?? {}))
    }

    return result
  })

  export async function get(agent: string) {
    return state().then((x) => x[agent])
  }

  export async function list() {
    const cfg = await Config.get()
    return pipe(
      await state(),
      values(),
      sortBy([(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"]),
    )
  }

  export async function defaultAgent() {
    const cfg = await Config.get()
    const agents = await state()

    if (cfg.default_agent) {
      const agent = agents[cfg.default_agent]
      if (!agent) throw new Error(`default agent "${cfg.default_agent}" not found`)
      if (agent.mode === "subagent") throw new Error(`default agent "${cfg.default_agent}" is a subagent`)
      if (agent.hidden === true) throw new Error(`default agent "${cfg.default_agent}" is hidden`)
      return agent.name
    }

    const primaryVisible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
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
