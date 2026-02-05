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
import { AskForTaskDoneOrContinueTool } from "./ask_for_task_done_or_continue"
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
import { type ToolDefinition } from "@opencode-ai/plugin"
import z from "zod"
import { Plugin } from "../plugin"
import { WebSearchTool } from "./websearch"
import { CodeSearchTool } from "./codesearch"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { LspTool } from "./lsp"
import { Truncate } from "./truncation"
import { PlanExitTool, PlanEnterTool } from "./plan"
import { SequentialThinkingTool } from "../costrict/tool/sequential-thinking"
import { FileOutlineTool } from "../costrict/tool/file-outline"
import { CheckpointTool } from "../costrict/tool/checkpoint"
import { ApplyPatchTool } from "./apply_patch"
import { MemoryBankTool } from "./memory-bank"
import { LintTool } from "./lint"

export namespace ToolRegistry {
  const log = Log.create({ service: "tool.registry" })

  export const state = Instance.state(async () => {
    const custom = [] as Tool.Info[]
    const glob = new Bun.Glob("{tool,tools}/*.{js,ts}")

    for (const dir of await Config.directories()) {
      for await (const match of glob.scan({
        cwd: dir,
        absolute: true,
        followSymlinks: true,
        dot: true,
      })) {
        const namespace = path.basename(match, path.extname(match))
        const mod = await import(match)
        for (const [id, def] of Object.entries<ToolDefinition>(mod)) {
          custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
        }
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
          const result = await def.execute(args as any, ctx)
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

    return [
      InvalidTool,
      TaskDoneTool,
      SubAgentTaskDoneTool,
      TaskDoneWithChangeIdTool,
      ...(["app", "cli", "desktop"].includes(Flag.COSTRICT_CLIENT) ? [QuestionTool] : []),
      BashTool,
      StrReplaceBasedEditTool,
      // GlobTool,
      // GrepTool,
      // Temporoly disable task tool for testing sub agent tool 
      // TaskTool,
      WebFetchTool,
      TodoWriteTool,
      MemoryBankTool,
      TodoReadTool,
      WebSearchTool,
      CodeSearchTool,
      SkillTool,
      SequentialThinkingTool,
      FileOutlineTool,
      // CallGraphTool, // deprecate
      // FileImportanceTool, // deprecate
      ...(config.experimental?.checkpoint !== false ? [CheckpointTool] : []),
      ...(Flag.COSTRICT_EXPERIMENTAL_LSP_TOOL ? [LspTool] : []),
      ApplyPatchTool,
      ...(config.experimental?.batch_tool === true ? [BatchTool] : []),
      ...(Flag.COSTRICT_EXPERIMENTAL_PLAN_MODE && Flag.COSTRICT_CLIENT === "cli" ? [PlanExitTool, PlanEnterTool] : []),
      LintTool,
      TaskDoneWithChangeIdTool,
      AskForTaskDoneOrContinueTool,
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
      providerID: string
      modelID: string
    },
    agent?: Agent.Info,
  ) {
    const tools = await all()
    const result = await Promise.all(
      tools
        .filter((t) => {
          // Enable websearch/codesearch for zen users OR via enable flag
          if (t.id === "codesearch" || t.id === "websearch") {
            return model.providerID === "opencode" || Flag.COSTRICT_ENABLE_EXA
          }

          // use apply tool in same format as codex
          const usePatch =
            model.modelID.includes("gpt-") && !model.modelID.includes("oss") && !model.modelID.includes("gpt-4")
          if (t.id === "apply_patch") return usePatch
          if (t.id === "edit" || t.id === "write") return !usePatch

          // task_done_with_change_id is only available to proposal agent
          if (t.id === "task_done_with_change_id") {
            return agent?.name === "proposal"
          }

          // ask_for_task_done_or_continue is only available to taskcheck agent
          if (t.id === "ask_for_task_done_or_continue") {
            return agent?.name === "taskcheck"
          }

          return true
        })
        .map(async (t) => {
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
