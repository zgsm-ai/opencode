import { $ } from "bun"
import { ConfigMarkdown } from "../config/markdown"
import { withTimeout } from "../util/timeout"
import { Tool } from "../tool/tool"
import { ToolRegistry } from "../tool/registry"
import { SessionID, MessageID } from "../session/schema"

export interface ToolCall {
  toolId: string
  params: Record<string, string>
}

export function parseToolCalls(content: string): ToolCall[] {
  const matches = Array.from(content.matchAll(ConfigMarkdown.TOOL_REGEX))
  
  return matches.map(match => {
    const toolId = match[1]
    const paramsStr = match[2] || ""
    
    const params: Record<string, string> = {}
    
    if (paramsStr.trim()) {
      // 解析 key=value 格式参数，支持多个参数用逗号分隔
      const paramPairs = paramsStr.split(",")
      
      for (const pair of paramPairs) {
        const trimmedPair = pair.trim()
        if (!trimmedPair) continue
        
        const equalIndex = trimmedPair.indexOf("=")
        if (equalIndex > 0) {
          const key = trimmedPair.slice(0, equalIndex).trim()
          const value = trimmedPair.slice(equalIndex + 1).trim()
          if (key) {
            params[key] = value
          }
        }
      }
    }
    
    return { toolId, params }
  })
}

function createMinimalContext(): Tool.Context {
  const sessionID = SessionID.make(crypto.randomUUID())
  const messageID = MessageID.make(crypto.randomUUID())
  const abortController = new AbortController()
  
  return {
    sessionID,
    messageID,
    agent: "dynamic-context",
    abort: abortController.signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
  }
}

async function executeToolCalls(content: string): Promise<string> {
  const toolCalls = parseToolCalls(content)
  
  if (toolCalls.length === 0) return content
  
  // 获取所有匹配的工具调用在原文中的位置和内容
  const matches = Array.from(content.matchAll(ConfigMarkdown.TOOL_REGEX))
  const placeholders = matches.map(m => m[0])
  
  // 获取可用工具（包括 visible=false 的内部工具）
  let tools: Awaited<ReturnType<typeof ToolRegistry.allInitialized>> = []
  try {
    tools = await ToolRegistry.allInitialized()
  } catch (e) {
    console.error("Failed to get tools:", e)
    return content
  }
  
  const results = await Promise.all(
    toolCalls.map(async (toolCall, index) => {
      try {
        // 查找匹配的工具
        const toolInfo = tools.find(t => t.id === toolCall.toolId)
        
        if (!toolInfo) {
          return `[ToolError: Tool "${toolCall.toolId}" not found]`
        }
        
        // 创建最小化上下文
        const context = createMinimalContext()
        
        // 执行工具（带30秒超时）
        const result = await withTimeout(
          toolInfo.execute(toolCall.params, context),
          30000
        )
        
        return result.output
      } catch (e) {
        // 检查是否是超时错误
        if (e instanceof Error && e.message.includes("timed out")) {
          return `[ToolError: Timeout after 30s]`
        }
        const msg = e instanceof Error ? e.message : String(e)
        return `[ToolError: ${msg}]`
      }
    })
  )
  
  // 替换原文中的工具调用为执行结果
  return placeholders.reduce(
    (acc, placeholder, i) => acc.replace(placeholder, results[i]),
    content
  )
}

export async function executeShellCommands(content: string): Promise<string> {
  const matches = Array.from(content.matchAll(ConfigMarkdown.SHELL_REGEX))
  
  if (matches.length === 0) return content
  
  const commands = matches.map(m => m[1])
  const placeholders = matches.map(m => m[0])
  
  const results = await Promise.all(
    commands.map(async cmd => {
      try {
        const result = await withTimeout(
          $`${cmd}`.cwd(process.cwd()).quiet(),
          30000
        )
        return result.stdout.toString().trim()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return `[Error: ${msg}]`
      }
    })
  )
  
  return placeholders.reduce(
    (acc, placeholder, i) => acc.replace(placeholder, results[i]),
    content
  )
}

export async function executeDynamicContext(content: string): Promise<string> {
  // 1. 先执行 executeShellCommands 处理 !`cmd` 语法
  const shellProcessed = await executeShellCommands(content)
  
  // 2. 再执行 executeToolCalls 处理 !tool{}() 语法
  const toolProcessed = await executeToolCalls(shellProcessed)
  
  return toolProcessed
}
