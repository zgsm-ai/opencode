import { PlanExitTool } from "./plan"
import { QuestionTool } from "./question"
import { BashTool } from "./bash"
import { StrReplaceBasedEditTool } from "./str_replace_based_edit_tool"
// import { GlobTool } from "./glob"
// import { GrepTool } from "./grep"
import { BatchTool } from "./batch"
import { TaskTool } from "./task"
import { TaskDoneTool } from "./task_done"
import { SubAgentTaskDoneTool } from "./sub_agent_task_done"
import { TaskDoneWithChangeIdTool } from "./task_done_with_change_id"
import { TodoWriteTool, TodoReadTool } from "./todo"
import { WebFetchTool } from "./webfetch"
import { InvalidTool } from "./invalid"
import { SkillTool } from "./skill"
import { SubCodingTool } from "./sub_coding"
import { QuickExploreTool } from "./quick_explore"
import type { Agent } from "../agent/agent"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { Config } from "../config/config"
import path from "path"
import { type ToolContext as PluginToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import z from "zod"
import { Plugin } from "../plugin"
import { ProviderID, type ModelID } from "../provider/schema"
import { WebSearchTool } from "./websearch"
import { CodeSearchTool } from "./codesearch"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { LspTool } from "./lsp"
import { Truncate } from "./truncation"
import { SequentialThinkingTool } from "../costrict/tool/sequential-thinking"
import { FileOutlineTool } from "../costrict/tool/file-outline"
import { CheckpointTool } from "../costrict/tool/checkpoint"
import { ApplyPatchTool } from "./apply_patch"
import { Glob } from "../util/glob"
import { pathToFileURL } from "url"
import { MemoryBankTool } from "./memory-bank"
import { LintTool } from "./lint"
import { ShowMarkdownToUserTool } from "./show_markdown_to_user"

export namespace ToolRegistry {
  const log = Log.create({ service: "tool.registry" })

  export const state = Instance.state(async () => {
    const custom = [] as Tool.Info[]

    const matches = await Config.directories().then((dirs) =>
      dirs.flatMap((dir) =>
        Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true }),
      ),
    )
    if (matches.length) await Config.waitForDependencies()
    for (const match of matches) {
      const namespace = path.basename(match, path.extname(match))
      const mod = await import(pathToFileURL(match).href)
      for (const [id, def] of Object.entries<ToolDefinition>(mod)) {
        custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
      }
    }

    const plugins = await Plugin.list()
    for (const plugin of plugins) {
      for (const [id, def] of Object.entries(plugin.tool ?? {})) {
        custom.push(fromPlugin(id, def))
      }
    }

    return { custom }
  })

  function fromPlugin(id: string, def: ToolDefinition): Tool.Info {
    return {
      id,
      init: async (initCtx) => ({
        parameters: z.object(def.args),
        description: def.description,
        execute: async (args, ctx) => {
          const pluginCtx = {
            ...ctx,
            directory: Instance.directory,
            worktree: Instance.worktree,
          } as unknown as PluginToolContext
          const result = await def.execute(args as any, pluginCtx)
          const out = await Truncate.output(result, {}, initCtx?.agent)
          return {
            title: "",
            output: out.content,
            metadata: { truncated: out.truncated },
          }
        },
      }),
    }
  }

  export async function register(tool: Tool.Info) {
    const { custom } = await state()
    const idx = custom.findIndex((t) => t.id === tool.id)
    if (idx >= 0) {
      custom.splice(idx, 1, tool)
      return
    }
    custom.push(tool)
  }

  async function all(): Promise<Tool.Info[]> {
    const custom = await state().then((x) => x.custom)
    const config = await Config.get()
    const question = ["app", "cli", "desktop"].includes(Flag.OPENCODE_CLIENT) || Flag.OPENCODE_ENABLE_QUESTION_TOOL

    return [
      InvalidTool,
      TaskDoneTool,
      SubAgentTaskDoneTool,
      TaskDoneWithChangeIdTool,
      ...(question ? [QuestionTool] : []),
      BashTool,
      StrReplaceBasedEditTool,
      // GlobTool,  // 已注释
      // GrepTool,  // 已注释
      // TaskTool,  // 已注释
      // WebFetchTool,  // 不需要
      // TodoWriteTool,  // 不需要
      MemoryBankTool,
      ShowMarkdownToUserTool,
      // TodoReadTool,  // 不需要
      // WebSearchTool,  // 不需要
      // CodeSearchTool,  // 不需要
      // SkillTool,  // 不需要
      SequentialThinkingTool,
      FileOutlineTool,
      // CallGraphTool,  // 已废弃
      // FileImportanceTool,  // 已废弃
      // ...(config.experimental?.checkpoint !== false ? [CheckpointTool] : []),  // 不需要
      // ...(Flag.COSTRICT_EXPERIMENTAL_LSP_TOOL ? [LspTool] : []),  // 不需要
      // ApplyPatchTool,  // 不需要
      // ...(config.experimental?.batch_tool === true ? [BatchTool] : []),  // 不需要
      // ...(Flag.COSTRICT_EXPERIMENTAL_PLAN_MODE && Flag.OPENCODE_CLIENT === "cli" ? [PlanExitTool] : []),  // 不需要
      LintTool,
      // TaskDoneWithChangeIdTool,  // 已在第109行注册，删除重复
      SubCodingTool,
      QuickExploreTool,
      ...custom,
    ]
  }

  export async function ids() {
    return all().then((x) => x.map((t) => t.id))
  }

  export async function tools(
    model: {
      providerID: ProviderID
      modelID: ModelID
    },
    agent?: Agent.Info,
  ) {
    const tools = await all()

    // 工具过滤现在完全由 agent 的 permission 配置控制
    // 不再需要硬编码的过滤逻辑
    const result = await Promise.all(
      tools.map(async (t) => {
        using _ = log.time(t.id)
        return {
          id: t.id,
          ...(await t.init({ agent })),
        }
      }),
    )
    return result
  }
}
