import z from "zod"
import { Tool } from "./tool"
import path from "path"
import fs from "fs/promises"
import { Instance } from "../project/instance"
import { assertExternalDirectory } from "./external-directory"
import { Log } from "../util/log"
import os from "os"
import { resolveResourcesPath } from "../util/resources"

const log = Log.create({ service: "lint-tool" })

// File extension mappings
const BIOME_EXTENSIONS = new Set([
  ".js", ".ts", ".cjs", ".mjs", ".d.cts", ".d.mts",
  ".jsx", ".tsx", ".json", ".jsonc", ".css"
])
const GO_EXTENSIONS = new Set([".go"])
const PYTHON_EXTENSIONS = new Set([".py", ".pyw"])
const CPP_EXTENSIONS = new Set([".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx", ".c++", ".h++"])
const RUST_EXTENSIONS = new Set([".rs"])
const JAVA_EXTENSIONS = new Set([".java"])
const RUBY_EXTENSIONS = new Set([".rb"])

// Export for testing
export const LINT_EXTENSIONS = {
  go: GO_EXTENSIONS,
  js: BIOME_EXTENSIONS,
  py: PYTHON_EXTENSIONS,
  cpp: CPP_EXTENSIONS,
  rust: RUST_EXTENSIONS,
  java: JAVA_EXTENSIONS,
  ruby: RUBY_EXTENSIONS,
}

// Language aliases
const LANGUAGE_ALIASES: Record<string, string> = {
  python: "py",
  py: "py",
  javascript: "js",
  typescript: "js",
  js: "js",
  golang: "go",
  go: "go",
  "c++": "cpp",
  cpp: "cpp",
  cxx: "cpp",
  rust: "rust",
  java: "java",
  ruby: "ruby",
}

export function getLintResourcesPath(): string {
  return resolveResourcesPath(import.meta.url, "lint")
}

export function inferLanguageFromExtension(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  const name = path.basename(filePath).toLowerCase()

  if (GO_EXTENSIONS.has(ext)) return "go"
  if (BIOME_EXTENSIONS.has(ext) || name.endsWith(".d.cts") || name.endsWith(".d.mts")) return "js"
  if (PYTHON_EXTENSIONS.has(ext)) return "py"
  if (CPP_EXTENSIONS.has(ext)) return "cpp"
  if (RUST_EXTENSIONS.has(ext)) return "rust"
  if (JAVA_EXTENSIONS.has(ext)) return "java"
  if (RUBY_EXTENSIONS.has(ext)) return "ruby"
  return null
}

export function getAvailableExtensionsForLanguage(lang: string): string[] {
  switch (lang) {
    case "go": return Array.from(GO_EXTENSIONS)
    case "js": return Array.from(BIOME_EXTENSIONS)
    case "py": return Array.from(PYTHON_EXTENSIONS)
    case "cpp": return Array.from(CPP_EXTENSIONS)
    case "rust": return Array.from(RUST_EXTENSIONS)
    case "java": return Array.from(JAVA_EXTENSIONS)
    case "ruby": return Array.from(RUBY_EXTENSIONS)
    default: return []
  }
}

function formatExtensions(exts: string[]): string {
  return exts.sort().join(", ")
}

export async function resolveLintExecutable(language: string): Promise<string | null> {
  const lintRoot = getLintResourcesPath()
  const isWindows = os.platform() === "win32"

  if (language === "rust") {
    const cargo = Bun.which("cargo")
    return cargo || null
  }

  if (language === "ruby") {
    const rubocop = Bun.which("rubocop")
    return rubocop || null
  }

  if (language === "java") {
    const javaDir = path.join(lintRoot, "java")
    await fs.mkdir(path.join(javaDir, "pmd-7.19.0", "conf"), { recursive: true }).catch(() => {})
    const exeName = isWindows ? "pmd.bat" : "pmd"
    const binDir = path.join(javaDir, "pmd-7.19.0", "bin")
    const exePath = path.join(binDir, exeName)
    if (await Bun.file(exePath).exists()) return exePath
    return null
  }

  const langDir = path.join(lintRoot, language)
  try {
    const stat = await fs.stat(langDir)
    if (!stat.isDirectory()) return null
  } catch {
    return null
  }

  const exeNameMap: Record<string, string> = {
    go: isWindows ? "revive.exe" : "revive",
    js: isWindows ? "biome.exe" : "biome",
    py: isWindows ? "ruff.exe" : "ruff",
    cpp: isWindows ? "clang-tidy.exe" : "clang-tidy",
  }
  const exeName = exeNameMap[language]
  if (!exeName) return null

  const entries = await Array.fromAsync(new Bun.Glob(`**/${exeName}`).scan({ cwd: langDir, absolute: true }))
  if (entries.length === 0) return null

  const platform = os.platform()
  const arch = os.arch()

  const scored = entries.map(p => {
    const lower = p.toLowerCase()
    let score = 0
    if (platform === "win32" && lower.includes("windows")) score += 10
    if (platform === "darwin" && lower.includes("darwin")) score += 10
    if (platform === "linux" && lower.includes("linux")) score += 10
    if (arch === "x64" && (lower.includes("x86_64") || lower.includes("amd64"))) score += 20
    if (arch === "arm64" && (lower.includes("aarch64") || lower.includes("arm64"))) score += 20
    return { path: p, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].path
}

async function checkJavaRuntimeAvailable(): Promise<boolean> {
  return Bun.which("java") !== undefined
}

function buildCommand(exePath: string, args: string[]): string[] {
  if (os.platform() === "win32" && /\.(bat|cmd)$/i.test(path.extname(exePath))) {
    return ["cmd.exe", "/c", exePath, ...args]
  }
  return [exePath, ...args]
}

function formatTimeoutError(language: string, runner: string, timeoutSeconds: number): string {
  const header = `Lint 执行超时：${runner}（language=${language}）在 ${timeoutSeconds} 秒内未完成。`

  const envDependentLangs = new Set(["go", "rust", "java", "cpp", "ruby"])
  let envHint = ""
  if (envDependentLangs.has(language)) {
    envHint = "补充说明：该语言的 lint 可能依赖运行环境与构建链（例如编译、解析整个项目、下载模块/依赖），因此超时/失败也可能是环境或构建问题导致，而非命令本身或终端异常。"
  }

  const languageHints: Record<string, string> = {
    go: "Go 提示：revive 在依赖缺失时会降级运行，只检查不需要类型信息的规则；如果超时，可能是文件过大或检查规则过多。",
    rust: "Rust 提示：cargo clippy 可能触发完整编译与依赖下载；可能环境问题：Rust 工具链不可用、项目不存在有效 Cargo.toml、首次构建或依赖下载耗时较长。",
    java: "Java 提示：PMD 依赖 Java 运行时执行静态分析；可能环境问题：JRE/JDK 不可用、版本不满足要求、JAVA_HOME 配置不正确。",
    cpp: "C/C++ 提示：clang-tidy 可能需要编译配置进行分析；可能环境问题：缺少 compile_commands.json、include 路径配置不正确、头文件依赖缺失。",
    ruby: "Ruby 提示：RuboCop 可能触发 gem 依赖解析与项目配置加载；可能环境问题：Ruby 环境不可用、gem 依赖未安装、项目 .rubocop.yml 配置异常。",
  }
  const langHint = languageHints[language] || ""

  const parts = [header]
  if (envHint) parts.push(envHint)
  if (langHint) parts.push(langHint)
  return parts.join("\n")
}

// Run revive on Go file
async function runRevive(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("go")
  if (!exePath) return { output: "", error: "未找到 revive 可执行文件" }

  const lintRoot = getLintResourcesPath()
  const bundledCfg = path.join(lintRoot, "go", "revive.toml")
  const args = ["-formatter", "default"]
  if (await Bun.file(bundledCfg).exists()) {
    args.push("-config", bundledCfg)
  }
  args.push(filePath)

  try {
    const proc = Bun.spawn(buildCommand(exePath, args), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    const outputLines: string[] = []
    if (stdout) {
      outputLines.push("=== Lint 输出 ===")
      outputLines.push(stdout)
    }
    if (stderr) {
      const filtered = stderr.split("\n").filter(line => {
        const lower = line.toLowerCase()
        return !lower.includes("could not import") && !lower.includes("cannot find package")
      })
      if (filtered.length > 0) {
        outputLines.push("=== Lint 错误/警告 ===")
        outputLines.push(filtered.join("\n"))
      }
    }

    return { output: outputLines.join("\n") || "未发现问题。" }
  } catch (e) {
    return { output: "", error: `运行 revive 时出错：${e}` }
  }
}

// Run biome on JS/TS file
async function runBiome(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("js")
  if (!exePath) return { output: "", error: "未找到 biome 可执行文件" }

  try {
    const proc = Bun.spawn(buildCommand(exePath, ["lint", "--reporter=json", filePath]), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    const outputLines: string[] = []
    if (stdout) {
      try {
        const lintData = JSON.parse(stdout)
        if (lintData.diagnostics && lintData.diagnostics.length > 0) {
          outputLines.push("=== 发现 Lint 问题 ===")
          for (const diag of lintData.diagnostics) {
            const severity = diag.severity || "未知"
            const category = diag.category || "未知"
            const messageParts = diag.message || []
            const messageText = messageParts.map((part: any) => 
              typeof part === "object" ? part.content || "" : String(part)
            ).join("")
            
            let locationInfo = ""
            if (diag.location) {
              const loc = diag.location
              if (loc.path && typeof loc.path === "object" && loc.path.file) {
                locationInfo = ` 在 ${path.basename(loc.path.file)} 中`
              }
              if (loc.span) {
                if (Array.isArray(loc.span) && loc.span.length >= 2) {
                  locationInfo += ` 位于位置 ${loc.span[0]}`
                } else if (typeof loc.span === "number") {
                  locationInfo += ` 位于位置 ${loc.span}`
                }
              }
            }
            outputLines.push(`[${severity.toUpperCase()}] ${category}: ${messageText}${locationInfo}`)
          }
        } else {
          outputLines.push("未发现 Lint 问题。")
        }
        if (lintData.summary) {
          outputLines.push("\n=== 概览 ===")
          outputLines.push(`错误：${lintData.summary.errors || 0}`)
          outputLines.push(`警告：${lintData.summary.warnings || 0}`)
          outputLines.push(`信息：${lintData.summary.infos || 0}`)
        }
      } catch {
        outputLines.push("=== Lint 输出 ===")
        outputLines.push(stdout)
      }
    } else {
      outputLines.push("未发现 Lint 问题。")
    }

    if (stderr) {
      const filtered = stderr.split("\n").filter(line => 
        !line.includes("The --json option is unstable/experimental")
      )
      if (filtered.length > 0) {
        outputLines.push("\n=== 工具消息 ===")
        outputLines.push(filtered.join("\n"))
      }
    }

    return { output: outputLines.join("\n") }
  } catch (e) {
    return { output: "", error: `运行 biome 时出错：${e}` }
  }
}

// Run ruff on Python file
async function runRuff(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("py")
  if (!exePath) return { output: "", error: "未找到 ruff 可执行文件" }

  try {
    const proc = Bun.spawn(buildCommand(exePath, ["check", "--output-format", "json", filePath]), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    const outputLines: string[] = []
    if (stdout) {
      try {
        const lintResults = JSON.parse(stdout)
        if (lintResults && lintResults.length > 0) {
          outputLines.push("=== 发现 Lint 问题 ===")
          for (const result of lintResults) {
            const code = result.code || "未知"
            const message = result.message || "无消息"
            const location = result.location || {}
            const endLocation = result.end_location || {}
            const fileName = result.filename || filePath
            const line = location.row || "?"
            const col = location.column || "?"
            const endLine = endLocation.row || line
            const endCol = endLocation.column || col
            
            const locationStr = (line === endLine && col === endCol) 
              ? `${fileName}:${line}:${col}`
              : `${fileName}:${line}:${col}-${endLine}:${endCol}`
            
            outputLines.push(`[${code}] ${locationStr}: ${message}`)
          }
        } else {
          outputLines.push("未发现 Lint 问题。")
        }
      } catch {
        outputLines.push("=== Lint 输出 ===")
        outputLines.push(stdout)
      }
    } else {
      outputLines.push("未发现 Lint 问题。")
    }

    if (stderr) {
      outputLines.push("\n=== 工具消息 ===")
      outputLines.push(stderr)
    }

    return { output: outputLines.join("\n") }
  } catch (e) {
    return { output: "", error: `运行 ruff 时出错：${e}` }
  }
}

// Run clang-tidy on C/C++ file
async function runClangTidy(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("cpp")
  if (!exePath) return { output: "", error: "未找到 clang-tidy 可执行文件" }

  try {
    const stdFlag = path.extname(filePath).toLowerCase() === ".c" ? "-std=c11" : "-std=c++17"
    const proc = Bun.spawn(buildCommand(exePath, [filePath, "--", stdFlag]), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    const outputLines: string[] = []
    if (stdout) {
      outputLines.push("=== 发现 Lint 问题 ===")
      outputLines.push(stdout)
      const issueCount = (stdout.match(/warning:/g) || []).length + (stdout.match(/error:/g) || []).length
      outputLines.push("\n=== 概览 ===")
      outputLines.push(`问题总数：${issueCount}`)
    } else {
      outputLines.push("未发现 Lint 问题。")
    }

    if (stderr) {
      outputLines.push("\n=== 工具消息 ===")
      outputLines.push(stderr)
    }

    return { output: outputLines.join("\n") }
  } catch (e) {
    return { output: "", error: `运行 clang-tidy 时出错：${e}` }
  }
}

// Run cargo clippy on Rust file
async function runClippy(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("rust")
  if (!exePath) return { output: "", error: "未找到 cargo 可执行文件。" }

  // Find Cargo.toml
  let projectRoot: string | null = null
  let currentDir = path.dirname(filePath)
  while (currentDir !== path.dirname(currentDir)) {
    if (await Bun.file(path.join(currentDir, "Cargo.toml")).exists()) {
      projectRoot = currentDir
      break
    }
    currentDir = path.dirname(currentDir)
  }

  if (!projectRoot) {
    return { output: "", error: "无法找到 Cargo.toml。请在包含 Cargo.toml 的 Rust 项目目录中运行 lint。" }
  }

  try {
    const proc = Bun.spawn(buildCommand(exePath, ["clippy", "--message-format=json"]), {
      stdout: "pipe",
      stderr: "pipe",
      cwd: projectRoot,
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    const outputLines: string[] = []
    outputLines.push("=== 发现 Lint 问题 ===")

    const jsonResults: any[] = []
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue
      try {
        const result = JSON.parse(line)
        if (result.reason === "compiler-message") {
          const message = result.message || {}
          if (message.level === "warning" || message.level === "error") {
            jsonResults.push(result)
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    if (jsonResults.length > 0) {
      for (const result of jsonResults) {
        const message = result.message || {}
        const level = message.level || "未知"
        let messageText = message.message || "无消息"
        const rendered = message.rendered
        if (rendered) messageText = rendered

        const spans = message.spans || []
        if (spans.length > 0) {
          const span = spans[0]
          const fileName = path.basename(span.file_name || filePath)
          const lineStart = span.line_start || "?"
          const lineEnd = span.line_end || lineStart
          const colStart = span.column_start || "?"
          const colEnd = span.column_end || colStart

          let locationStr = `${fileName}:${lineStart}:${colStart}`
          if (lineStart !== lineEnd || colStart !== colEnd) {
            locationStr += `-${lineEnd}:${colEnd}`
          }
          outputLines.push(`[${level.toUpperCase()}] ${locationStr}: ${messageText}`)
        } else {
          outputLines.push(`[${level.toUpperCase()}] ${messageText}`)
        }
      }
    } else {
      outputLines.push("未发现 clippy 警告。")
    }

    outputLines.push("\n=== 概览 ===")
    if (exitCode === 0) {
      outputLines.push("未发现 clippy 警告。")
    } else {
      outputLines.push(`Clippy 发现问题（退出码：${exitCode}）。`)
    }

    if (stderr) {
      outputLines.push("\n=== 工具消息 ===")
      outputLines.push(stderr)
    }

    return { output: outputLines.join("\n") }
  } catch (e) {
    return { output: "", error: `运行 cargo clippy 时出错：${e}` }
  }
}

// Run PMD on Java file
async function runPmd(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("java")
  if (!exePath) return { output: "", error: "未找到 PMD 可执行文件。请确保已安装 Java。" }

  try {
    const proc = Bun.spawn(buildCommand(exePath, [
      "check",
      "-d", filePath,
      "-R", "category/java/bestpractices.xml",
      "-f", "text"
    ]), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    const filteredStdout = stdout.split("\n").filter(line => {
      const normalized = line.replace(/\\/g, "/")
      if (normalized.includes("The configuration directory [") && normalized.includes("pmd-7.19.0/conf") && normalized.includes("does not exist")) return false
      return true
    }).join("\n").trim()

    const outputLines: string[] = []
    if (filteredStdout) {
      outputLines.push("=== 发现 Lint 问题 ===")
      outputLines.push(filteredStdout)
      outputLines.push("\n=== 概览 ===")
      outputLines.push(`问题总数：${filteredStdout.split("\n").filter(l => l.trim()).length}`)
    } else {
      outputLines.push("未发现 Lint 问题。")
    }

    if (stderr) {
      const filtered = stderr.split("\n").filter(line => {
        const normalized = line.replace(/\\/g, "/")
        if (normalized.includes("The configuration directory [") && normalized.includes("pmd-7.19.0/conf") && normalized.includes("does not exist")) return false
        if (line.includes("Progressbar rendering conflicts")) return false
        if (line.includes("This analysis could be faster")) return false
        if (line.includes("https://docs.pmd-code.org")) return false
        return true
      })
      if (filtered.length > 0) {
        outputLines.push("\n=== 工具消息 ===")
        outputLines.push(filtered.join("\n"))
      }
    }

    return { output: outputLines.join("\n") }
  } catch (e) {
    return { output: "", error: `运行 PMD 时出错：${e}` }
  }
}

// Run RuboCop on Ruby file
async function runRubocop(filePath: string): Promise<{ output: string; error?: string }> {
  const exePath = await resolveLintExecutable("ruby")
  if (!exePath) return { output: "", error: "未找到 RuboCop 可执行文件。" }

  try {
    const proc = Bun.spawn(buildCommand(exePath, ["--format", "json", filePath]), {
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    const outputLines: string[] = []
    if (stdout) {
      try {
        const rubocopData = JSON.parse(stdout)
        if (rubocopData.files && rubocopData.files.length > 0) {
          outputLines.push("=== 发现 Lint 问题 ===")

          if (rubocopData.summary) {
            outputLines.push("\n=== 概览 ===")
            outputLines.push(`违规计数：${rubocopData.summary.offense_count || 0}`)
            outputLines.push(`目标文件计数：${rubocopData.summary.target_file_count || 1}`)
            outputLines.push(`已检查文件计数：${rubocopData.summary.inspected_file_count || 1}`)
          }

          for (const fileData of rubocopData.files) {
            const fileName = path.basename(fileData.path || filePath)
            const offenses = fileData.offenses || []
            if (offenses.length > 0) {
              outputLines.push(`\n--- ${fileName} ---`)
              for (const offense of offenses) {
                const severity = offense.severity || "warning"
                const copName = offense.cop_name || "未知"
                const message = offense.message || ""
                const location = offense.location || {}
                const line = location.line || "?"
                const column = location.column || ""
                const locationStr = column ? `${line}:${column}` : `${line}`
                outputLines.push(`[${severity.toUpperCase()}] ${copName}：${message}，位于 ${locationStr}`)
              }
            }
          }

          if (!rubocopData.files.some((f: any) => (f.offenses || []).length > 0)) {
            outputLines.push("未发现 Lint 问题。")
          }
        } else {
          outputLines.push("未发现 Lint 问题。")
        }
      } catch {
        outputLines.push("=== Lint 输出 ===")
        outputLines.push(stdout)
      }
    } else {
      outputLines.push("未发现 Lint 问题。")
    }

    if (stderr) {
      outputLines.push("\n=== 工具消息 ===")
      outputLines.push(stderr)
    }

    return { output: outputLines.join("\n") }
  } catch (e) {
    return { output: "", error: `运行 RuboCop 时出错：${e}` }
  }
}

// Main lint tool definition
export const LintTool = Tool.define("lint", async () => {
  // Check available languages at initialization
  const availableLanguages: string[] = []
  const unavailableReasons: Record<string, string> = {}

  // Check Go
  if (await resolveLintExecutable("go")) {
    availableLanguages.push("go")
  } else {
    unavailableReasons["go"] = "revive 可执行文件未找到"
  }

  // Check JS
  if (await resolveLintExecutable("js")) {
    availableLanguages.push("js")
  } else {
    unavailableReasons["js"] = "biome 可执行文件未找到"
  }

  // Check Python
  if (await resolveLintExecutable("py")) {
    availableLanguages.push("py")
  } else {
    unavailableReasons["py"] = "ruff 可执行文件未找到"
  }

  // Check C++
  if (await resolveLintExecutable("cpp")) {
    availableLanguages.push("cpp")
  } else {
    unavailableReasons["cpp"] = "clang-tidy 可执行文件未找到"
  }

  // Check Rust
  if (await resolveLintExecutable("rust")) {
    availableLanguages.push("rust")
  } else {
    unavailableReasons["rust"] = "cargo 可执行文件未找到（需要 Rust 工具链）"
  }

  // Check Java
  const javaExe = await resolveLintExecutable("java")
  if (javaExe) {
    if (await checkJavaRuntimeAvailable()) {
      availableLanguages.push("java")
    } else {
      unavailableReasons["java"] = "缺少 Java 运行时环境（JRE/JDK）"
    }
  } else {
    unavailableReasons["java"] = "PMD 可执行文件未找到"
  }

  // Check Ruby
  if (await resolveLintExecutable("ruby")) {
    availableLanguages.push("ruby")
  } else {
    unavailableReasons["ruby"] = "rubocop 可执行文件未找到（需要 gem install rubocop）"
  }

  // Build dynamic description based on available languages
  let description: string

  if (availableLanguages.length === 0) {
    description = `对文件运行静态代码分析（linting）以检测代码质量问题、
潜在 bug、风格违规和其他问题。

当前没有可用的 lint 工具。请确保以下条件满足：
- Java: 安装 Java 运行时 JRE/JDK 8+（https://www.oracle.com/java/technologies/downloads/）
- Rust: 安装 Rust 工具链（https://rustup.rs/）
- Ruby: 安装 RuboCop（gem install rubocop）
`
  } else {
    // Build language descriptions
    const formatExts = (exts: Set<string>): string => {
      return Array.from(exts).sort().join("、")
    }

    const langDescriptions: string[] = []

    if (availableLanguages.includes("go")) {
      langDescriptions.push(`- Go（${formatExts(GO_EXTENSIONS)}）：revive`)
    }

    if (availableLanguages.includes("js")) {
      langDescriptions.push(`- JavaScript/TypeScript/JSON/CSS（${formatExts(BIOME_EXTENSIONS)}）：biome`)
    }

    if (availableLanguages.includes("py")) {
      langDescriptions.push(`- Python（${formatExts(PYTHON_EXTENSIONS)}）：ruff`)
    }

    if (availableLanguages.includes("cpp")) {
      langDescriptions.push(`- C/C++（${formatExts(CPP_EXTENSIONS)}）：clang-tidy`)
    }

    if (availableLanguages.includes("rust")) {
      langDescriptions.push(`- Rust（${formatExts(RUST_EXTENSIONS)}）：cargo clippy（需 Cargo.toml）`)
    }

    if (availableLanguages.includes("java")) {
      langDescriptions.push(`- Java（${formatExts(JAVA_EXTENSIONS)}）：PMD`)
    }

    if (availableLanguages.includes("ruby")) {
      langDescriptions.push(`- Ruby（${formatExts(RUBY_EXTENSIONS)}）：RuboCop`)
    }

    // Build examples based on available languages
    const examples: string[] = []
    if (availableLanguages.includes("go")) {
      examples.push(`- Go：file_path="/path/to/file.go"（自动推断 language="go"，使用 revive）`)
    }
    if (availableLanguages.includes("js")) {
      examples.push(`- JavaScript/TypeScript：file_path="/path/to/file.ts"（自动推断 language="js"，使用 biome；也支持 .js/.tsx/.jsx/.json/.jsonc/.css 等）`)
    }
    if (availableLanguages.includes("py")) {
      examples.push(`- Python：file_path="/path/to/file.py"（自动推断 language="py"，使用 ruff）`)
    }
    if (availableLanguages.includes("cpp")) {
      examples.push(`- C/C++：file_path="/path/to/file.cpp"（自动推断 language="cpp"，使用 clang-tidy；也支持 .c/.h/.hpp 等）`)
    }
    if (availableLanguages.includes("rust")) {
      examples.push(`- Rust：file_path="/path/to/src/lib.rs"（自动推断 language="rust"，使用 cargo clippy；需要项目内存在 Cargo.toml）`)
    }
    if (availableLanguages.includes("java")) {
      examples.push(`- Java：file_path="/path/to/Foo.java"（自动推断 language="java"，使用 PMD）`)
    }
    if (availableLanguages.includes("ruby")) {
      examples.push(`- Ruby：file_path="/path/to/foo.rb"（自动推断 language="ruby"，使用 RuboCop）`)
    }

    // Example for files without extensions
    if (availableLanguages.length > 0) {
      examples.push(`- 无扩展名文件：file_path="/path/to/Makefile"，language="py"（允许通过 language 指定 linter）`)
    }

    description = `对文件运行静态代码分析（linting）以检测代码质量问题、
潜在 bug、风格违规和其他问题。

支持多种编程语言和文件类型：

${langDescriptions.join("\n")}

工具会根据文件扩展名自动选择合适的 lint 工具。
language 参数是可选的 - 如果未提供，将从文件扩展名自动推断。
当文件没有扩展名时，允许通过 language 指定要使用的 linter。

返回详细的 lint 结果，包括文件路径、行号、问题类型和消息。

使用示例：
${examples.join("\n")}
`
  }

  // Build enum list - include both standardized codes and aliases
  const enumList = [...availableLanguages]
  // Add aliases for available languages
  for (const lang of availableLanguages) {
    for (const [alias, target] of Object.entries(LANGUAGE_ALIASES)) {
      if (target === lang && !enumList.includes(alias)) {
        enumList.push(alias)
      }
    }
  }
  enumList.sort()

  return {
    description,
    parameters: z.object({
      filePath: z.string().describe("要进行 lint 检查的文件的绝对路径。"),
      language: z.enum(enumList as [string, ...string[]]).optional().describe("编程语言类型。可选 - 如不提供，将从文件扩展名推断。"),
    }),
    async execute(params, ctx) {
      let filePathStr = params.filePath
      let language = (params.language || "").trim().toLowerCase()

      // Normalize language aliases
      if (language in LANGUAGE_ALIASES) {
        language = LANGUAGE_ALIASES[language]
      }

      if (!filePathStr) {
        throw new Error("file_path 参数是必需的")
      }

      const filePath = path.isAbsolute(filePathStr) 
        ? filePathStr 
        : path.resolve(Instance.directory, filePathStr)

      await assertExternalDirectory(ctx, filePath)

      // Request permission
      await ctx.ask({
        permission: "lint",
        patterns: [filePath],
        always: [path.dirname(filePath) + "/*"],
        metadata: {},
      })

      const file = Bun.file(filePath)
      if (!await file.exists()) {
        throw new Error(`文件未找到：${filePath}`)
      }

      const stat = await file.stat()
      if (!stat.isFile()) {
        throw new Error(`路径不是一个文件：${filePath}`)
      }

      const inferredLang = inferLanguageFromExtension(filePath)

      // Reject unknown non-empty extensions
      if (path.extname(filePath) && !inferredLang) {
        const availableExtensions: string[] = []
        if (availableLanguages.includes("go")) availableExtensions.push(`Go: ${formatExtensions(getAvailableExtensionsForLanguage("go"))}`)
        if (availableLanguages.includes("js")) availableExtensions.push(`Biome (JS/TS/JSX/TSX/JSON/JSONC/CSS): ${formatExtensions(getAvailableExtensionsForLanguage("js"))}`)
        if (availableLanguages.includes("py")) availableExtensions.push(`Python: ${formatExtensions(getAvailableExtensionsForLanguage("py"))}`)
        if (availableLanguages.includes("cpp")) availableExtensions.push(`C/C++: ${formatExtensions(getAvailableExtensionsForLanguage("cpp"))}`)
        if (availableLanguages.includes("rust")) availableExtensions.push(`Rust: ${formatExtensions(getAvailableExtensionsForLanguage("rust"))}`)
        if (availableLanguages.includes("java")) availableExtensions.push(`Java: ${formatExtensions(getAvailableExtensionsForLanguage("java"))}`)
        if (availableLanguages.includes("ruby")) availableExtensions.push(`Ruby: ${formatExtensions(getAvailableExtensionsForLanguage("ruby"))}`)

        throw new Error(
          `不支持的文件扩展名 '${path.extname(filePath)}'。此 lint 工具仅支持：${availableExtensions.join("; ")}。请不要为该文件类型调用 lint。`
        )
      }

      // Infer language if not provided
      if (!language) {
        if (inferredLang) {
          language = inferredLang
        } else {
          throw new Error(
            `无法推断语言，因为该文件没有受支持的扩展名。请指定 language 参数。受支持的语言：${availableLanguages.sort().join(", ")}`
          )
        }
      }

      // Check if language is available
      if (!availableLanguages.includes(language)) {
        const reason = unavailableReasons[language] || "未知原因"
        throw new Error(`语言 '${language}' 不可用：${reason}`)
      }

      // Verify language matches file extension
      if (inferredLang && inferredLang !== language) {
        throw new Error(
          `语言不匹配：指定了 '${language}'，但文件扩展名 '${path.extname(filePath)}' 提示为 '${inferredLang}'。请使用 language='${inferredLang}' 或移除 language 参数。`
        )
      }

      // Run appropriate linter
      const title = `lint ${path.relative(Instance.worktree, filePath)}`
      let result: { output: string; error?: string }

      switch (language) {
        case "go":
          result = await runRevive(filePath)
          break
        case "js":
          result = await runBiome(filePath)
          break
        case "py":
          result = await runRuff(filePath)
          break
        case "cpp":
          result = await runClangTidy(filePath)
          break
        case "rust":
          result = await runClippy(filePath)
          break
        case "java":
          result = await runPmd(filePath)
          break
        case "ruby":
          result = await runRubocop(filePath)
          break
        default:
          throw new Error(`不支持的语言：${language}`)
      }

      if (result.error) {
        throw new Error(result.error)
      }

      return {
        title,
        output: result.output,
        metadata: { language, filePath },
      }
    },
  }
})
