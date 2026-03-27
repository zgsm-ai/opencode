import { PlanExitTool } from "./plan"
import { QuestionTool } from "./question"
import { BashTool } from "../plugin/tdd/tools/bash"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { BatchTool } from "./batch"
import { ReadTool } from "./read"
import { TaskTool } from "./task"
import { TodoWriteTool, TodoReadTool } from "./todo"
import { WebFetchTool } from "./webfetch"
import { WriteTool } from "./write"
import { InvalidTool } from "./invalid"
import { SkillTool } from "./skill"
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
import { SpecManageTool } from "../costrict/tool/spec-manage"
import { ApplyPatchTool } from "./apply_patch"
import { WorkflowTool } from "../costrict/tool/workflow"
import { Glob } from "../util/glob"
import { pathToFileURL } from "url"

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
            output: out.truncated ? out.content : result,
            metadata: { truncated: out.truncated, outputPath: out.truncated ? out.outputPath : undefined },
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
      ...(question ? [QuestionTool] : []),
      BashTool,
      ReadTool,
      GlobTool,
      GrepTool,
      EditTool,
      WriteTool,
      TaskTool,
      WebFetchTool,
      TodoWriteTool,
      // TodoReadTool,
      WebSearchTool,
      CodeSearchTool,
      SkillTool,
      SequentialThinkingTool,
      FileOutlineTool,
      // CallGraphTool, // deprecate
      // FileImportanceTool, // deprecate
      ...(config.experimental?.checkpoint !== false ? [CheckpointTool] : []),
      ...(config.experimental?.spec_manage !== false ? [SpecManageTool] : []),
      ...(Flag.COSTRICT_EXPERIMENTAL_LSP_TOOL ? [LspTool] : []),
      ApplyPatchTool,
      WorkflowTool,
      ...(config.experimental?.batch_tool === true ? [BatchTool] : []),
      ...(Flag.COSTRICT_EXPERIMENTAL_PLAN_MODE && Flag.OPENCODE_CLIENT === "cli" ? [PlanExitTool] : []),
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
    const result = await Promise.all(
      tools
        .filter((t) => {
          // visible 过滤逻辑 - 如果工具设置为不可见，需要Agent显式启用
          if (t.visible === false) {
            // 如果Agent没有显式启用此工具，则过滤掉
            if (agent?.tools?.[t.id] !== true) {
              return false
            }
          }

          // Enable websearch/codesearch for zen users OR via enable flag
          if (t.id === "codesearch" || t.id === "websearch") {
            return model.providerID === ProviderID.opencode || Flag.COSTRICT_ENABLE_EXA
          }

          // use apply tool in same format as codex
          const usePatch =
            model.modelID.includes("gpt-") && !model.modelID.includes("oss") && !model.modelID.includes("gpt-4")
          if (t.id === "apply_patch") return usePatch
          if (t.id === "edit" || t.id === "write") return !usePatch

          return true
        })
        .map(async (t) => {
          using _ = log.time(t.id)
          const tool = await t.init({ agent })
          const output = {
            description: tool.description,
            parameters: tool.parameters,
          }
          await Plugin.trigger("tool.definition", { toolID: t.id }, output)
          return {
            id: t.id,
            ...tool,
            description: output.description,
            parameters: output.parameters,
          }
        }),
    )
    return result
  }

  export async function allInitialized(agent?: Agent.Info) {
    const tools = await all()
    const result = await Promise.all(
      tools
        .filter((t) => {
          // 注意：这里跳过 visible 过滤逻辑，让所有工具（包括 visible=false 的工具）都能被返回

          // Enable websearch/codesearch for zen users OR via enable flag
          if (t.id === "codesearch" || t.id === "websearch") {
            return Flag.COSTRICT_ENABLE_EXA
          }

          // use apply tool in same format as codex
          // 对于动态上下文场景，不过滤 apply_patch/edit/write，允许两者都存在
          return true
        })
        .map(async (t) => {
          try {
            using _ = log.time(t.id)
            const tool = await t.init({ agent })
            const output = {
              description: tool.description,
              parameters: tool.parameters,
            }
            await Plugin.trigger("tool.definition", { toolID: t.id }, output)
            return {
              id: t.id,
              ...tool,
              description: output.description,
              parameters: output.parameters,
            }
          } catch (e) {
            log.error(`Failed to initialize tool ${t.id}:`, { error: e instanceof Error ? e.message : String(e) })
            return null
          }
        }),
    )
    // 过滤掉初始化失败的工具
    return result.filter((t): t is NonNullable<typeof t> => t !== null)
  }
}
