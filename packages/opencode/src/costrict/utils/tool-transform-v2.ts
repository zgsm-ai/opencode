/**
 * Clean XML tags from tool name
 *
 * Some AI models (e.g., GLM4.7) may include XML tags like <tool_name> in tool calls.
 * This function removes these tags and returns the clean tool name.
 *
 * @param toolname - Original tool name that may contain XML tags
 * @param availableTools - Optional set of available tool names (for custom tool priority)
 * @returns Cleaned tool name
 *
 * @example
 * toolNameFormatter("<bash>read</bash>") // returns "read"
 * toolNameFormatter("read") // returns "read"
 * toolNameFormatter("read_file", new Set(["read", "write"])) // returns "read"
 * toolNameFormatter("my_tool", new Set(["my_tool"])) // returns "my_tool" (custom tool takes priority)
 */
export const toolNameFormatter = (toolname: string, availableTools?: Set<string>) => {
  if (!toolname || (!toolname.includes("<") && !toolname.includes(">"))) {
    return toolAlias(toolname, availableTools)
  }

  let tags = []
  let fixedToolname = toolname
  if (fixedToolname.includes("<tool_call>")) {
    tags = fixedToolname.split("<tool_call>").sort((a, b) => b.length - a.length)
    fixedToolname = tags[0]
  }

  if (fixedToolname.includes("</tool_call>")) {
    tags = fixedToolname.split("</tool_call>").sort((a, b) => b.length - a.length)
    fixedToolname = tags[0]
  }

  if (fixedToolname.includes("<arg_value>")) {
    tags = fixedToolname.split("<arg_value>").sort((a, b) => b.length - a.length)
    fixedToolname = tags[0]
  }

  return toolAlias(fixedToolname, availableTools)
}

const isRecord = (input: unknown): input is Record<string, unknown> => {
  if (input === null) return false
  if (Array.isArray(input)) return false
  return typeof input === "object"
}

export class ToolInputRecordError extends Error {
  constructor(toolCallId: string) {
    super(`Tool input must be a record for tool call ${toolCallId}`)
    this.name = "ToolInputRecordError"
  }
}

const parseTextInput = (input: string, toolCallId: string) => {
  const text = input.trim()
  if (text === "") return {}

  try {
    const value = JSON.parse(text)
    if (isRecord(value)) return value
    throw new ToolInputRecordError(toolCallId)
  } catch {
    throw new ToolInputRecordError(toolCallId)
  }
}

export const toolInputRecord = (input: unknown, toolCallId: string) => {
  if (isRecord(input)) return input
  if (typeof input === "string") return parseTextInput(input, toolCallId)
  if (input === undefined || input === null) return {}
  throw new ToolInputRecordError(toolCallId)
}

/**
 * Clean XML tags from tool input parameters
 *
 * Some AI models may include XML tags in parameter key names.
 * This function removes these tags and returns a clean parameter object.
 *
 * @param input - Original tool input payload, can be object or string
 * @param toolCallId - Tool call ID for logging purposes
 * @returns Cleaned tool input object
 *
 * @example
 * toolInputFormatter({ "<path>": "src/index.ts" }, "call-1")
 * // returns { "path": "src/index.ts" }
 * toolInputFormatter("{\"path\":\"src/index.ts\"}", "call-2")
 * // returns { "path": "src/index.ts" }
 */
export const toolInputFormatter = (input: unknown, toolCallId: string) => {
  const data = toolInputRecord(input, toolCallId)
  const cleaned = {} as Record<string, unknown>

  Object.entries(data).forEach(([key, value]) => {
    if (!key.includes("<arg_key>")) {
      cleaned[key] = value
      return
    }

    const next = key.split("<arg_key>").pop() as string
    cleaned[next] = value
    console.log("toolInputFormatter", `${toolCallId} | ${key} -> ${next}`)
  })

  return cleaned
}

/**
 * Tool name alias mapping
 *
 * Maps various tool name aliases to their actual internal tool names.
 * This allows AI models to use different naming conventions that map to the same tool.
 *
 * **Priority**: Custom tools and already-registered tool names take priority over alias mapping.
 * If a tool name is already registered (including custom tools), it will be returned as-is.
 *
 * Internal tool names (as registered in registry.ts):
 * - read, write, bash, grep, list, glob, edit, websearch, webfetch, codesearch,
 *   todowrite, todoread, question, task, skill, batch, lsp, apply_patch, etc.
 *
 * @param toolName - Original tool name (may be an alias)
 * @param availableTools - Optional set of available tool names (for custom tool priority)
 * @returns Actual internal tool name
 *
 * @example
 * toolAlias("read_file") // returns "read"
 * toolAlias("run_shell_command") // returns "bash"
 * toolAlias("read") // returns "read" (no transformation needed)
 *
 * // With custom tools
 * const tools = new Set(["read", "write", "my_custom_tool"])
 * toolAlias("my_custom_tool", tools) // returns "my_custom_tool" (custom tool takes priority)
 * toolAlias("read_file", tools) // returns "read" (alias mapped to registered tool)
 */
export function toolAlias(toolName: string, availableTools?: Set<string>): string {
  // Priority 1: If the tool name is already in the available tools (including custom tools),
  // return it as-is without any alias mapping
  if (availableTools && availableTools.has(toolName)) {
    return toolName
  }
  
  // Priority 2: Apply alias mapping
  // Alias mapping: external/descriptive name -> internal tool name
  const aliasMap: Record<string, string> = {
    // File operations - map descriptive names to internal names
    list_directory: "list",
    list_dir: "list",
    listDirectory: "list",
    ls: "list",
    
    search_file_content: "grep",
    search_files: "grep",
    searchFiles: "grep",
    search: "grep",
    
    // edit/replace aliases removed to avoid compatibility
    
    // Shell operations
    run_shell_command: "bash",
    runShellCommand: "bash",
    execute_command: "bash",
    executeCommand: "bash",
    shell: "bash",
    exec: "bash",
    command: "bash",
    run_command: "bash",
    
    // Web operations
    web_fetch: "webfetch",
    webFetch: "webfetch",
    fetch: "webfetch",
    fetch_url: "webfetch",
    
    google_web_search: "websearch",
    web_search: "websearch",
    webSearch: "websearch",
    search_web: "websearch",
    google_search: "websearch",
    
    // Code operations
    codebase_investigator: "codesearch",
    code_search: "codesearch",
    codeSearch: "codesearch",
    search_code: "codesearch",
    searchCode: "codesearch",
    
    // Todo operations
    write_todos: "todowrite",
    writeTodos: "todowrite",
    update_todos: "todowrite",
    
    read_todos: "todoread",
    readTodos: "todoread",
    get_todos: "todoread",
    
    // Question/help operations
    save_memory: "question",
    saveMemory: "question",
    ask_question: "question",
    askQuestion: "question",
    cli_help: "question",
    ask_user: "question",
    askUser: "question",
    
    // Pattern matching
    glob_search: "glob",
    globSearch: "glob",
    find_files: "glob",
    findFiles: "glob",
    
    // Task management
    create_task: "task",
    createTask: "task",
    new_task: "task",
    newTask: "task",
    taskdone: "task_done",
    task_done_with_changeid: "task_done_with_change_id",
    taskdone_with_change_id: "task_done_with_change_id",
    taskdone_with_changeid: "task_done_with_change_id",
    subagent_task_done: "sub_agent_task_done",
    sub_agent_taskdone: "sub_agent_task_done",
    
    // Batch operations
    batch_operations: "batch",
    batchOperations: "batch",
    batch_tools: "batch",
    batchTools: "batch",
    
    // LSP operations
    lsp_query: "lsp",
    lspQuery: "lsp",
    language_server: "lsp",
    languageServer: "lsp",
    
    // Skill operations
    activate_skill: "skill",
    activateSkill: "skill",
    use_skill: "skill",
    
    // Apply patch
    patch: "apply_patch",
    applyPatch: "apply_patch",

    // Sequential thinking
    "sequential-thinking": "sequentialthinking",
    sequence_thinking: "sequentialthinking",
    sequential_thinking: "sequentialthinking",
  }
  
  // Get the mapped name, or use original if no mapping exists
  const mappedName = aliasMap[toolName] || toolName
  
  // Priority 3: If availableTools is provided and the mapped name is not in it,
  // return the original name (this handles edge cases where alias mapping points to non-existent tools)
  if (availableTools && !availableTools.has(mappedName) && mappedName !== toolName) {
    return toolName
  }
  
  return mappedName
}
