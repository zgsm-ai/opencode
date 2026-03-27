import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"

// 配置常量
export const EDITOR_CONTEXT_CONFIG = {
  /** 最大标签页数量 */
  MAX_TABS: 10,
}

// 编辑器上下文事件定义
export const EditorContextEvent = {
  Update: BusEvent.define(
    "editor.context.update",
    z.object({
      activeFile: z
        .object({
          relativePath: z.string(),
          fileRef: z.string(),
          selection: z
            .object({
              startLine: z.number(),
              endLine: z.number(),
            })
            .optional(),
        })
        .optional(),
      openTabs: z.array(z.string()),
    }),
  ),
}

// 内存中的编辑器上下文
export namespace EditorContext {
  export interface EditorContextData {
    activeFile?: {
      relativePath: string
      fileRef: string
      selection?: {
        startLine: number
        endLine: number
      }
    }
    openTabs: string[]
    updatedAt: number
  }

  let currentContext: EditorContextData | null = null

  export function setContext(ctx: Omit<EditorContextData, "updatedAt">): void {
    // 限制标签页数量
    const limitedTabs = ctx.openTabs.slice(0, EDITOR_CONTEXT_CONFIG.MAX_TABS)
    
    currentContext = {
      ...ctx,
      openTabs: limitedTabs,
      updatedAt: Date.now(),
    }
    
    // 发布事件（可选)
    Bus.publish(EditorContextEvent.Update, {
      activeFile: ctx.activeFile,
      openTabs: limitedTabs,
    })
  }

  export function getContext(): EditorContextData | null {
    return currentContext
  }

  export function formatForPrompt(): string {
    const ctx = currentContext
    if (!ctx) return ""

    const parts: string[] = []
    parts.push(`<editor_context>`)

    if (ctx.activeFile) {
      let activeFile = `Editor Active File: ${ctx.activeFile.fileRef}`
      if (ctx.activeFile.selection) {
        activeFile = activeFile +  `(Selection range: ${ctx.activeFile.selection.startLine}-${ctx.activeFile.selection.endLine})`
      }
      parts.push(activeFile)
    }

    if (ctx?.openTabs?.length > 0) {
      parts.push(`Editor Open Tabs: ${ctx.openTabs.join(", ")}`)
    }

    parts.push(`</editor_context>`)

    const result = parts.join("\n")


    return result
  }
}
