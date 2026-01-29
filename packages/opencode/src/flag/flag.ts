function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function number(key: string) {
  const value = process.env[key]
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export namespace Flag {
  // COSTRICT flags
  export const COSTRICT_AUTO_SHARE = truthy("COSTRICT_AUTO_SHARE")
  export const COSTRICT_GIT_BASH_PATH = process.env["COSTRICT_GIT_BASH_PATH"]
  export const COSTRICT_CONFIG = process.env["COSTRICT_CONFIG"]
  export const COSTRICT_CONFIG_CONTENT = process.env["COSTRICT_CONFIG_CONTENT"]
  export declare const COSTRICT_CONFIG_DIR: string | undefined
  export declare const COSTRICT_DISABLE_PROJECT_CONFIG: boolean

  // OPENCODE_ flags
  export const OPENCODE_AUTO_SHARE = truthy("OPENCODE_AUTO_SHARE")
  export const OPENCODE_GIT_BASH_PATH = process.env["OPENCODE_GIT_BASH_PATH"]
  export const OPENCODE_CONFIG = process.env["OPENCODE_CONFIG"]
  export const OPENCODE_CONFIG_CONTENT = process.env["OPENCODE_CONFIG_CONTENT"]
  export declare const OPENCODE_CONFIG_DIR: string | undefined
  export declare const OPENCODE_DISABLE_PROJECT_CONFIG: boolean

  export const COSTRICT_DISABLE_AUTOUPDATE = truthy("COSTRICT_DISABLE_AUTOUPDATE")
  export const COSTRICT_DISABLE_PRUNE = truthy("COSTRICT_DISABLE_PRUNE")
  export const COSTRICT_DISABLE_TERMINAL_TITLE = truthy("COSTRICT_DISABLE_TERMINAL_TITLE")
  export const COSTRICT_PERMISSION = process.env["COSTRICT_PERMISSION"]
  export const COSTRICT_DISABLE_DEFAULT_PLUGINS = truthy("COSTRICT_DISABLE_DEFAULT_PLUGINS")
  export const COSTRICT_DISABLE_LSP_DOWNLOAD = truthy("COSTRICT_DISABLE_LSP_DOWNLOAD")
  export const COSTRICT_ENABLE_EXPERIMENTAL_MODELS = truthy("COSTRICT_ENABLE_EXPERIMENTAL_MODELS")
  export const COSTRICT_DISABLE_AUTOCOMPACT = truthy("COSTRICT_DISABLE_AUTOCOMPACT")
  export const COSTRICT_DISABLE_MODELS_FETCH = truthy("COSTRICT_DISABLE_MODELS_FETCH")
  export const COSTRICT_DISABLE_CLAUDE_CODE = truthy("COSTRICT_DISABLE_CLAUDE_CODE")
  export const COSTRICT_DISABLE_CLAUDE_CODE_PROMPT =
    COSTRICT_DISABLE_CLAUDE_CODE || truthy("COSTRICT_DISABLE_CLAUDE_CODE_PROMPT")
  export const COSTRICT_DISABLE_CLAUDE_CODE_SKILLS =
    COSTRICT_DISABLE_CLAUDE_CODE || truthy("COSTRICT_DISABLE_CLAUDE_CODE_SKILLS")
  export const COSTRICT_FAKE_VCS = process.env["COSTRICT_FAKE_VCS"]
  export const COSTRICT_CLIENT = process.env["COSTRICT_CLIENT"] ?? "cli"
  export const COSTRICT_SERVER_PASSWORD = process.env["COSTRICT_SERVER_PASSWORD"]
  export const COSTRICT_SERVER_USERNAME = process.env["COSTRICT_SERVER_USERNAME"]
  export const COSTRICT_BASE_URL = process.env["COSTRICT_BASE_URL"]
  export const COSTRICT_APP_URL =
    process.env["COSTRICT_APP_URL"] ??
    (COSTRICT_BASE_URL
      ? `${COSTRICT_BASE_URL}/costrict/opencode-web/dist/`
      : "https://zgsm.sangfor.com/costrict/opencode-web/dist/")
  export const COSTRICT_DISABLE_FILETIME_CHECK = truthy("COSTRICT_DISABLE_FILETIME_CHECK")

  // Experimental
  export const COSTRICT_EXPERIMENTAL = truthy("COSTRICT_EXPERIMENTAL")
  export const COSTRICT_EXPERIMENTAL_FILEWATCHER = truthy("COSTRICT_EXPERIMENTAL_FILEWATCHER")
  export const COSTRICT_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("COSTRICT_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const COSTRICT_EXPERIMENTAL_ICON_DISCOVERY =
    COSTRICT_EXPERIMENTAL || truthy("COSTRICT_EXPERIMENTAL_ICON_DISCOVERY")
  export const COSTRICT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT = truthy("COSTRICT_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const COSTRICT_ENABLE_EXA =
    truthy("COSTRICT_ENABLE_EXA") || COSTRICT_EXPERIMENTAL || truthy("COSTRICT_EXPERIMENTAL_EXA")
  export const COSTRICT_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH = number("COSTRICT_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH")
  export const COSTRICT_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("COSTRICT_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const COSTRICT_SHELL_TIMEOUT = process.env["COSTRICT_SHELL_TIMEOUT"]
  export const COSTRICT_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("COSTRICT_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const COSTRICT_EXPERIMENTAL_OXFMT = COSTRICT_EXPERIMENTAL || truthy("COSTRICT_EXPERIMENTAL_OXFMT")
  export const COSTRICT_EXPERIMENTAL_LSP_TY = truthy("COSTRICT_EXPERIMENTAL_LSP_TY")
  export const COSTRICT_EXPERIMENTAL_LSP_TOOL = COSTRICT_EXPERIMENTAL || truthy("COSTRICT_EXPERIMENTAL_LSP_TOOL")
  export const COSTRICT_EXPERIMENTAL_PLAN_MODE = COSTRICT_EXPERIMENTAL || truthy("COSTRICT_EXPERIMENTAL_PLAN_MODE")

  // OPENCODE flags
  export const OPENCODE_DISABLE_AUTOUPDATE = truthy("OPENCODE_DISABLE_AUTOUPDATE")
  export const OPENCODE_DISABLE_PRUNE = truthy("OPENCODE_DISABLE_PRUNE")
  export const OPENCODE_DISABLE_TERMINAL_TITLE = truthy("OPENCODE_DISABLE_TERMINAL_TITLE")
  export const OPENCODE_PERMISSION = process.env["OPENCODE_PERMISSION"]
  export const OPENCODE_DISABLE_DEFAULT_PLUGINS = truthy("OPENCODE_DISABLE_DEFAULT_PLUGINS")
  export const OPENCODE_DISABLE_LSP_DOWNLOAD = truthy("OPENCODE_DISABLE_LSP_DOWNLOAD")
  export const OPENCODE_ENABLE_EXPERIMENTAL_MODELS = truthy("OPENCODE_ENABLE_EXPERIMENTAL_MODELS")
  export const OPENCODE_DISABLE_AUTOCOMPACT = truthy("OPENCODE_DISABLE_AUTOCOMPACT")
  export const OPENCODE_DISABLE_MODELS_FETCH = truthy("OPENCODE_DISABLE_MODELS_FETCH")
  export const OPENCODE_DISABLE_CLAUDE_CODE = truthy("OPENCODE_DISABLE_CLAUDE_CODE")
  export const OPENCODE_DISABLE_CLAUDE_CODE_PROMPT =
    OPENCODE_DISABLE_CLAUDE_CODE || truthy("OPENCODE_DISABLE_CLAUDE_CODE_PROMPT")
  export const OPENCODE_DISABLE_CLAUDE_CODE_SKILLS =
    OPENCODE_DISABLE_CLAUDE_CODE || truthy("OPENCODE_DISABLE_CLAUDE_CODE_SKILLS")
  export const OPENCODE_FAKE_VCS = process.env["OPENCODE_FAKE_VCS"]
  export const OPENCODE_CLIENT = process.env["OPENCODE_CLIENT"] ?? "cli"
  export const OPENCODE_SERVER_PASSWORD = process.env["OPENCODE_SERVER_PASSWORD"]
  export const OPENCODE_SERVER_USERNAME = process.env["OPENCODE_SERVER_USERNAME"]
  export const OPENCODE_MODELS_URL = process.env["OPENCODE_MODELS_URL"]
  export const OPENCODE_DISABLE_FILETIME_CHECK = truthy("OPENCODE_DISABLE_FILETIME_CHECK")

  // Experimental
  export const OPENCODE_EXPERIMENTAL = truthy("OPENCODE_EXPERIMENTAL")
  export const OPENCODE_EXPERIMENTAL_FILEWATCHER = truthy("OPENCODE_EXPERIMENTAL_FILEWATCHER")
  export const OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const OPENCODE_EXPERIMENTAL_ICON_DISCOVERY =
    OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_ICON_DISCOVERY")
  export const OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT = truthy("OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const OPENCODE_ENABLE_EXA =
    truthy("OPENCODE_ENABLE_EXA") || OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_EXA")
  export const OPENCODE_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH = number("OPENCODE_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH")
  export const OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const OPENCODE_EXPERIMENTAL_OXFMT = OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_OXFMT")
  export const OPENCODE_EXPERIMENTAL_LSP_TY = truthy("OPENCODE_EXPERIMENTAL_LSP_TY")
  export const OPENCODE_EXPERIMENTAL_LSP_TOOL = OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_LSP_TOOL")
  export const OPENCODE_EXPERIMENTAL_PLAN_MODE = OPENCODE_EXPERIMENTAL || truthy("OPENCODE_EXPERIMENTAL_PLAN_MODE")
}

// Dynamic getter for COSTRICT_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "COSTRICT_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("COSTRICT_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for COSTRICT_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "COSTRICT_CONFIG_DIR", {
  get() {
    return process.env["COSTRICT_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for OPENCODE_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "OPENCODE_CONFIG_DIR", {
  get() {
    return process.env["OPENCODE_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for OPENCODE_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "OPENCODE_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("OPENCODE_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})
