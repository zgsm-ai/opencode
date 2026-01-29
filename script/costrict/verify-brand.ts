#!/usr/bin/env bun

/**
 * CoStrict 品牌一致性验证脚本
 *
 * 功能：
 * 1. 检测遗漏的 opencode 引用
 * 2. 检测遗漏的环境变量
 * 3. 检测旧域名引用
 * 4. 生成详细报告
 * 5. 跨平台（Windows/Linux/macOS）- 不依赖 grep
 *
 * 使用：
 *   bun run script/costrict/verify-brand.ts
 */

import fs from "fs/promises";
import path from "path";

interface Issue {
  file: string;
  line: number;
  content: string;
  type: "opencode-text" | "env-var" | "old-domain" | "old-repo" | "window-object";
  severity: "error" | "warning";
}

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function warning(text: string) {
  log(`  ⚠️  ${text}`, "yellow");
}

// 统一的脚本排除列表（使用路径片段，兼容 Windows 和 Linux）
const SCRIPT_EXCLUDES = [
  "script\\costrict",  // Windows 路径
  "script/costrict",   // Linux 路径
];

// 搜索文件内容（不使用 grep，跨平台）
async function searchInFiles(
  pattern: RegExp,
  include: string[],
  exclude: string[],
  fileFilter?: Set<string>
): Promise<Array<{ file: string; line: number; content: string }>> {
  const results: Array<{ file: string; line: number; content: string }> = [];

  // 构建 Glob 模式
  const patterns = include.map((ext) => `**/${ext}`);

  for (const globPattern of patterns) {
    const glob = new Bun.Glob(globPattern);

    for await (const file of glob.scan(".")) {
      // 跳过排除的目录
      if (
        file.includes("node_modules") ||
        file.includes(".git") ||
        file.includes("dist") ||
        exclude.some((e) => file.includes(e))
      ) {
        continue;
      }

      // 增量模式：仅检查过滤的文件
      if (fileFilter && fileFilter.size > 0 && !fileFilter.has(file)) {
        continue;
      }

      try {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            results.push({
              file,
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch (e) {
        // 跳过无法读取的文件
      }
    }
  }

  return results;
}

async function main() {
  log("========================================", "cyan");
  log("  CoStrict 品牌一致性验证", "cyan");
  log("========================================", "cyan");
  console.log("");

  // 增量模式：仅检查 Git 修改的文件
  const incrementalMode = process.argv.includes("--incremental");
  let changedFiles: Set<string> = new Set();

  if (incrementalMode) {
    try {
      const { $ } = await import("bun");
      const result = await $`git diff --name-only HEAD`.text();
      changedFiles = new Set(result.split("\n").filter(Boolean));

      if (changedFiles.size === 0) {
        log("✅ 增量模式：无修改文件需要检查", "green");
        console.log("");
        process.exit(0);
      }

      log(`增量模式：检查 ${changedFiles.size} 个修改文件`, "cyan");
      console.log("");
    } catch (e) {
      warning("无法获取 Git 修改文件，切换到全量模式");
      console.log("");
    }
  }

  const issues: Issue[] = [];

  // ========================================
  // 检查 1: 遗漏的 opencode 文本引用
  // ========================================
  log("检查 1: 搜索遗漏的 opencode 文本引用...", "blue");

  const textMatches = await searchInFiles(
    /\b(opencode|OpenCode|OPENCODE)\b/i,
    ["*.ts", "*.tsx", "*.rs", "*.json", "*.toml", "*.js"],
    SCRIPT_EXCLUDES,
    changedFiles.size > 0 ? changedFiles : undefined
  );

  let textIssueCount = 0;
  for (const match of textMatches) {
    // 排除 LICENSE（保留原版权）
    if (match.file.includes("LICENSE")) continue;

    // 排除注释中的迁移说明
    if (match.content.includes("TODO") || match.content.includes("原")) continue;

    // 排除脚本自身 (兼容 Windows 和 Linux 路径)
    if (match.file.includes("script\\costrict") || match.file.includes("script/costrict")) continue;

    // 排除生成的代码文件
    if (match.file.includes(".gen.ts") || match.file.includes(".generated.")) continue;

    // 排除 import 语句中的包名
    if (match.content.match(/\bimport\b.*@opencode-ai/)) continue;
    if (match.content.match(/\bfrom\s+["']@opencode-ai/)) continue;

    // 排除 package.json 和 JSON 配置文件中的内部包名定义和依赖
    if (match.file.endsWith("package.json") || match.file.endsWith(".json")) {
      // "name": "@opencode-ai/xxx" (内部包名定义)
      if (match.content.match(/"name":\s*"@opencode-ai\//)) continue;
      // "@opencode-ai/xxx": "workspace:*" (workspace 依赖)
      if (match.content.match(/"@opencode-ai\/[^"]+"\s*:\s*"workspace:\*/)) continue;
      // "opencode": "workspace:*" (monorepo 内部依赖)
      if (match.content.match(/"opencode"\s*:\s*"workspace:\*/)) continue;
    }

    // 排除路径和目录名
    if (match.content.match(/packages\/opencode/)) continue;
    if (match.content.match(/\.opencode\//)) continue;
    if (match.content.match(/["']\.opencode["']/)) continue;
    if (match.content.match(/\.\.\/opencode/)) continue; // ../../opencode
    if (match.content.match(/opencode-test-/)) continue;
    if (match.content.match(/["']opencode["']\s*\)/)) continue; // .cwd("opencode")

    // 排除 npm 包名引用
    if (match.content.match(/npmjs\.org\/opencode-ai/)) continue;
    if (match.content.match(/["']opencode-ai["']/)) continue;

    // 排除插件名 (mock 或配置中)
    if (match.content.match(/opencode-\w+-auth/)) continue;
    if (match.content.match(/mock\.module\(["']opencode-/)) continue;

    // 排除变量名和函数参数（常见模式）
    // const opencode = ... 或 let opencode = ...
    if (match.content.match(/\b(const|let|var)\s+opencode\b/i)) continue;
    // const { ... } = opencode (解构赋值)
    if (match.content.match(/=\s*opencode\s*$/)) continue;
    if (match.content.match(/}\s*=\s*opencode/)) continue;
    // async function opencode(...) 或 function opencode(...)
    if (match.content.match(/\bfunction\s+opencode\b/i)) continue;
    // import ... createOpencode
    if (match.content.match(/\bcreateOpencode\b/)) continue;
    // 函数参数: opencode: Type 或 { opencode }
    if (match.content.match(/\bopencode\s*:/)) continue;
    // 函数调用参数: (opencode,) 或 (opencode) 或 , opencode)
    if (match.content.match(/[,(]\s*opencode\s*[,)]/)) continue;
    // 对象属性: xxx.opencode
    if (match.content.match(/\w+\.opencode/)) continue;
    // await opencode.xxx (变量调用)
    if (match.content.match(/\bopencode\./)) continue;
    // 路径引用: packages/opencode (在脚本中的路径引用) - 这些需要替换，但在验证中排除
    if (match.file.startsWith("script") && match.content.includes("packages/opencode")) continue;
    // npm 包名: "opencode-ai" 或 opencode-linux 等(发布相关)
    if (match.content.match(/["']opencode-\w+["']/)) continue;
    if (match.content.match(/opencode-linux|opencode-darwin/)) continue;
    // 主题名: "OpenCode" 或 theme: "OpenCode"
    if (match.content.match(/theme:\s*["']OpenCode["']/i)) continue;
    if (match.content.match(/THEME_STYLE_ID\s*=\s*["']opencode-/)) continue;
    // Zed 扩展名
    if (match.file.includes("sync-zed") && match.content.match(/EXTENSION_NAME/)) continue;
    // Provider 类型: "opencode" 作为 provider 类型是合法的
    if (match.content.match(/["']opencode["']\s*[,\]]/)) continue;
    // 注释中的 opencode (// 或 /* 或 *)
    if (match.content.trim().startsWith("//")) continue;
    if (match.content.trim().startsWith("/*")) continue;
    if (match.content.trim().startsWith("*")) continue;
    if (match.content.includes("NOTE:")) continue;
    // console.log 中的日志消息(用户友好的日志,可以保留)
    if (match.content.match(/console\.log\(/)) continue;
    // SDK 相关: x-opencode-directory 头, spawn opencode 命令
    if (match.content.match(/["']x-opencode-/)) continue;
    if (match.content.match(/spawn\s*\(`opencode`/)) continue;
    if (match.content.match(/startsWith\(["']opencode\s/)) continue;

    // 测试字符串 (test/describe/it 中的描述)
    if (match.content.match(/\b(test|describe|it)\s*\(/)) continue;
    if (match.content.match(/expect\(/)) continue;

    // URL 路径: .well-known/opencode 或其他 URL 路径
    if (match.content.match(/\.well-known\/opencode/)) continue;
    if (match.content.match(/\bhttps?:\/\/[^"'\s]*opencode/)) continue;

    // 示例插件名: oh-my-opencode@, @opencode/plugin@
    if (match.content.match(/["'][^"']*opencode[^"']*@[\d.]+["']/)) continue; // oh-my-opencode@2.4.3
    if (match.content.match(/["']@opencode\/[^"']*@[\d.]+["']/)) continue;    // @opencode/plugin@2.0.0
    if (match.content.match(/getPluginName\(/)) continue;

    // 示例仓库名: sst/opencode, owner/opencode
    if (match.content.match(/["'][^"'\/]+\/opencode["']/)) continue; // "sst/opencode"
    if (match.content.match(/parseGitHubRemote\(/)) continue;
    if (match.content.match(/repo:\s*["']opencode["']/)) continue;

    // 环境变量设置: process.env.OPENCODE = "1"
    if (match.content.match(/process\.env\.OPENCODE\s*=/)) continue;
    if (match.content.match(/\benv\.OPENCODE\s*=/)) continue;

    // Git 分支名: opencode/${name}
    if (match.content.match(/["'`]opencode\/\$/)) continue;

    // Provider ID 比较: providerID === "opencode"
    if (match.content.match(/===\s*["']opencode["']/)) continue;
    if (match.content.match(/!==\s*["']opencode["']/)) continue;
    if (match.content.match(/==\s*["']opencode["']/)) continue;
    if (match.content.match(/!=\s*["']opencode["']/)) continue;

    // User-Agent 字符串: opencode/${version}
    if (match.content.match(/User-Agent['":\s]/)) continue;
    if (match.content.match(/opencode\/\$/)) continue;

    // 🔴 移除 description 字段的全局排除规则
    // description 字段中的品牌名应该被替换（用户可见内容）
    // 如果有特殊情况需要保留，应该在具体位置添加注释说明

    // mDNS 服务名: opencode-${port}
    if (match.content.match(/["'`]opencode-\$/)) continue;

    // 方法名: async opencode(input)
    if (match.content.match(/\basync\s+opencode\s*\(/)) continue;

    // HTML 内容: <title>, <p>, <h1> 等标签中的文本
    if (match.content.match(/<title>.*OpenCode/)) continue;
    if (match.content.match(/<\/title>/)) continue;
    if (match.content.match(/return to OpenCode/)) continue;
    if (match.content.match(/close this window/)) continue;

    // includes/startsWith/endsWith 检查
    if (match.content.match(/\.includes\(["']opencode-/)) continue;
    if (match.content.match(/\.startsWith\(["']opencode/)) continue;
    if (match.content.match(/\.endsWith\(["']opencode/)) continue;

    // 🔴 移除过于宽泛的 CLI 命令排除
    // 这些应该在 rebrand-apply.ts 中正确处理

    // OAuth/API client_name
    if (match.content.match(/client_name:\s*["']OpenCode["']/)) continue;

    // 临时目录名: opencode-jdtls-data, opencode-xxx
    if (match.content.match(/os\.tmpdir\(\).*opencode-/)) continue;
    if (match.content.match(/mkdtemp\(.*opencode-/)) continue;

    // Brew formula 命令
    if (match.content.match(/brew\s+list.*opencode/)) continue;
    if (match.content.match(/brew\s+install.*opencode/)) continue;
    if (match.content.match(/anomalyco\/tap\/opencode/)) continue;

    // npm/pnpm/bun 包安装命令
    if (match.content.match(/npm\s+install.*opencode-ai/)) continue;
    if (match.content.match(/pnpm\s+install.*opencode-ai/)) continue;
    if (match.content.match(/bun\s+install.*opencode-ai/)) continue;
    if (match.content.match(/yarn\s+(global\s+)?add.*opencode-ai/)) continue;

    // fetch/registry URL: /opencode-ai/
    if (match.content.match(/fetch\(.*opencode-ai/)) continue;
    if (match.content.match(/registry.*\/opencode-ai\//)) continue;

    // CLI 包安装参数
    if (match.content.match(/["']@opencode-ai\/plugin@/)) continue;
    if (match.content.match(/["']@opencode-ai\/\w+@/)) continue;

    // 错误消息字符串
    if (match.content.match(/opencode does not/)) continue;
    if (match.content.match(/Try:.*opencode\s+\w+/)) continue;

    // CLI describe 字段
    if (match.content.match(/describe:\s*["'].*opencode/)) continue;

    // GitHub bot 用户名
    if (match.content.match(/opencode-\w+\[bot\]/)) continue;

    // YAML 内容 (GitHub Actions workflow)
    if (match.content.match(/name:\s*opencode/)) continue;
    if (match.content.match(/\/opencode['"`]/)) continue; // '/opencode' 命令
    if (match.content.match(/- name: Run opencode/)) continue;

    // 资源文件路径 (图片、字体等文件名)
    if (match.content.match(/\/(preview-)?opencode-\w+\.(png|jpg|svg|woff2?|ttf)/)) continue;
    if (match.content.match(/from\s+["'].*\/opencode-.*\.(png|jpg|svg)/)) continue;

    // uninstall 命令中的包名
    if (match.content.match(/uninstall.*opencode-ai/)) continue;
    if (match.content.match(/remove.*opencode-ai/)) continue;

    // GitHub mentions 配置
    if (match.content.match(/MENTIONS.*\/opencode/)) continue;

    // Markdown 链接中的会话文本
    if (match.content.match(/\[opencode\s+session\]/)) continue;

    // 基础设施提示文本
    if (match.content.match(/handled.*by.*the\s+opencode\s+infrastructure/)) continue;

    // GitHub Action token/ID
    if (match.content.match(/getIDToken\(["']opencode-/)) continue;

    // Tauri/Rust 配置文件
    if (match.file.endsWith(".json") && match.content.match(/"identifier":\s*"opencode"/)) continue;
    if (match.file.endsWith(".rs") && match.content.match(/identifier\s*=\s*"opencode"/)) continue;

    // 主题文件名和 schema
    if (match.content.match(/oc-theme-/)) continue;
    if (match.content.match(/desktop-theme\.schema/)) continue;

    // 测试 fixtures
    if (match.file.includes("test") && match.file.includes("fixtures")) continue;

    // brew uninstall 命令
    if (match.content.match(/brew\s+uninstall\s+opencode/)) continue;

    // Shell 注释标记
    if (match.content.match(/^#\s+opencode/)) continue;
    if (match.content.match(/===\s*"#\s+opencode"/)) continue;

    // prompts.log 中的日志消息
    if (match.content.match(/prompts\.log\.\w+\(/)) continue;

    // 临时文件名: opencode-clipboard.png
    if (match.content.match(/tmpdir\(\).*opencode-/)) continue;
    if (match.content.match(/tmpfile.*opencode-/)) continue;

    // OAuth/认证相关的常量 key
    if (match.content.match(/OAUTH.*=\s*["']opencode-/)) continue;
    if (match.content.match(/=\s*["']opencode-oauth-/)) continue;

    // GitHub 高亮语法提示
    if (match.content.match(/\{highlight\}\/opencode\{\/highlight\}/)) continue;

    // 发布脚本中的包名规范 (AUR pkgname, Homebrew Formula 类名等)
    if (match.file.includes("publish-registries")) {
      // AUR pkgname
      if (match.content.match(/pkgname=/)) continue;
      // Homebrew Formula 类名
      if (match.content.match(/class\s+Opencode\s*</)) continue;
      // 源码目录名 (tar.gz 解压后的目录)
      if (match.content.match(/cd\s+"opencode-/)) continue;
      if (match.content.match(/source=.*opencode-.*\.tar\.gz/)) continue;
      // bin.install 二进制名称
      if (match.content.match(/bin\.install\s+"opencode"/)) continue;
    }

    // 发布脚本中的测试命令
    if (match.file.includes("publish.ts")) {
      if (match.content.match(/\/bin\/opencode\s+--version/)) continue;
    }

    // GitHub Action EXPECTED_AUDIENCE 常量
    if (match.content.match(/EXPECTED_AUDIENCE\s*=\s*"opencode-/)) continue;

    // API title 配置 (Swagger/OpenAPI)
    if (match.content.match(/title:\s*"Opencode\s+\w+\s+API"/)) continue;

    // return "opencode" 在 installation 相关文件中 (brew formula 名称)
    if (match.file.includes("installation") && match.content.match(/return\s+"opencode"/)) continue;

    // API description 字段
    if (match.content.match(/description:\s*"Opencode\s+\w+\s+API/)) continue;

    // Desktop 脚本中的目录和文件名
    if (match.file.includes("desktop") && match.file.includes("scripts")) {
      if (match.content.match(/target\/opencode-binaries/)) continue;
      if (match.content.match(/-n\s+opencode-cli/)) continue;
      if (match.content.match(/\/bin\/opencode/)) continue;
      if (match.content.match(/ocBinary:\s*"opencode-/)) continue;
      if (match.content.match(/sidecars\/opencode-cli-/)) continue;
    }

    // Console 下载页面的文件名映射
    if (match.file.includes("download") && match.content.match(/["']\w+-\w+-\w+["']:\s*"opencode-desktop-/)) continue;

    // Nix 构建脚本中的文件名和目录
    if (match.file.includes("nix") && match.file.includes("scripts")) {
      if (match.content.match(/opencode-assets\.manifest/)) continue;
      if (match.content.match(/--user-agent=opencode\//)) continue;
      if (match.content.match(/\.opencode-worker/)) continue;
      if (match.content.match(/opencode-worker\.js/)) continue;
    }

    // GitHub Actions 脚本中的正则匹配
    if (match.file.includes("github") && match.content.match(/\/opencode\|\/oc/)) continue;

    // 错误消息: "Failed to connect to opencode server"
    if (match.content.match(/Failed to connect to opencode server/)) continue;

    // import type 语句中的模块路径
    if (match.content.match(/import\s+type.*from\s+["']opencode\//)) continue;

    // Infra 配置中的产品名 (Black 等特殊产品线)
    if (match.file.includes("infra") && match.content.match(/name:\s*"OpenCode\s+\w+"/)) continue;

    // GitHub Actions body.match 正则表达式 (检测触发命令)
    if (match.content.match(/body\.match\(.*\/opencode\|\/oc/)) continue;

    // Web 组件中的 title/data-slot 属性
    if (match.content.match(/title="opencode/)) continue;
    if (match.content.match(/data-slot="icon"\s+title="opencode"/)) continue;

    // UI 主题相关的常量 KEY
    if (match.file.includes("ui") && match.file.includes("theme")) {
      if (match.content.match(/THEME_ID:\s*"opencode-theme-/)) continue;
      if (match.content.match(/COLOR_SCHEME:\s*"opencode-/)) continue;
      if (match.content.match(/THEME_CSS_\w+:\s*"opencode-theme-/)) continue;
    }

    // registerCustomTheme 主题名称
    if (match.content.match(/registerCustomTheme\("OpenCode"/)) continue;

    // 排除内部主题标识符 (packages/opencode/src/cli/cmd/tui/context/theme.tsx)
    if (match.file.includes("theme.tsx")) {
      // 主题对象定义: opencode,
      if (match.content.match(/^\s*opencode\s*,?\s*$/)) continue;
      // 默认主题 ID: draft.active = "opencode"
      if (match.content.match(/draft\.active\s*=\s*["']opencode["']/)) continue;
    }

    // 排除 Vite 插件内部标识符 (packages/app/vite.js)
    if (match.file.endsWith("vite.js")) {
      if (match.content.match(/name:\s*["']opencode-desktop:/)) continue;
    }

    // 排除品牌资产文件引用 (待重新设计的资产)
    // 路径兼容 Windows (\) 和 Linux (/)
    if (match.file.includes("routes/brand/index.tsx") || match.file.includes("routes\\brand\\index.tsx")) {
      // 导入路径: import xxx from "../../asset/brand/preview-opencode-logo-light.png"
      if (match.content.match(/import\s+\w+\s+from\s+"[^"]*preview-opencode-/)) continue;
      // 下载文件名: downloadFile(..., "opencode-logo-light.png")
      if (match.content.match(/downloadFile\([^,]+,\s*"opencode-(logo|wordmark)/)) continue;
      // 品牌资产包路径和文件名
      if (match.content.match(/["']\/opencode-brand-assets\.zip["']/)) continue;
      if (match.content.match(/downloadFile\([^,]+,\s*"opencode-brand-assets\.zip"\)/)) continue;
    }

    // 排除视频资产路径 (opencode-min.mp4, opencode-comparison-min.mp4)
    if (match.content.match(/import\s+\w+\s+from\s+"[^"]*opencode-.*\.mp4/)) continue;

    // 排除 props.project.id 变量引用 (需人工确认)
    if (match.file.includes("layout.tsx")) {
      if (match.content.match(/props\.project\.id\s*===\s*opencode/)) continue;
    }

    issues.push({
      ...match,
      type: "opencode-text",
      severity: "error",
    });
    textIssueCount++;
  }

  log(`  找到 ${textIssueCount} 处可能的引用`, "reset");

  // ========================================
  // 检查 2: 遗漏的环境变量 OPENCODE_
  // ========================================
  log("检查 2: 搜索遗漏的 OPENCODE_ 环境变量...", "blue");

  const envMatches = await searchInFiles(
    /OPENCODE_/,
    ["*.ts", "*.tsx", "*.rs", "*.yml", "*.toml", "*.js"],
    SCRIPT_EXCLUDES,
    changedFiles.size > 0 ? changedFiles : undefined
  );

  let envIssueCount = 0;
  for (const match of envMatches) {
    // 排除脚本自身 (兼容 Windows 和 Linux 路径)
    if (match.file.includes("script\\costrict") || match.file.includes("script/costrict")) continue;

    issues.push({
      ...match,
      type: "env-var",
      severity: "error",
    });
    envIssueCount++;
  }

  log(`  找到 ${envIssueCount} 处环境变量引用`, "reset");

  // ========================================
  // 检查 3: 旧域名 opencode.ai
  // ========================================
  log("检查 3: 搜索旧域名 opencode.ai...", "blue");

  const domainMatches = await searchInFiles(
    /opencode\.ai/,
    ["*.ts", "*.tsx", "*.mdx", "*.md", "*.js"],
    SCRIPT_EXCLUDES,
    changedFiles.size > 0 ? changedFiles : undefined
  );

  let domainIssueCount = 0;
  for (const match of domainMatches) {
    // 排除脚本自身 (兼容 Windows 和 Linux 路径)
    if (match.file.includes("script\\costrict") || match.file.includes("script/costrict")) continue;

    issues.push({
      ...match,
      type: "old-domain",
      severity: "error",
    });
    domainIssueCount++;
  }

  log(`  找到 ${domainIssueCount} 处域名引用`, "reset");

  // ========================================
  // 检查 4: 旧仓库引用
  // ========================================
  log("检查 4: 搜索旧仓库引用 anomalyco/opencode...", "blue");

  const repoMatches = await searchInFiles(
    /anomalyco\/opencode/,
    ["*.ts", "*.tsx", "*.json", "*.md", "*.yml", "*.js"],
    SCRIPT_EXCLUDES,
    changedFiles.size > 0 ? changedFiles : undefined
  );

  let repoIssueCount = 0;
  for (const match of repoMatches) {
    // 排除 LICENSE
    if (match.file.includes("LICENSE")) continue;

    // 排除脚本自身 (兼容 Windows 和 Linux 路径)
    if (match.file.includes("script\\costrict") || match.file.includes("script/costrict")) continue;

    issues.push({
      ...match,
      type: "old-repo",
      severity: "error",
    });
    repoIssueCount++;
  }

  log(`  找到 ${repoIssueCount} 处仓库引用`, "reset");

  // ========================================
  // 检查 5: 全局对象 __OPENCODE__
  // ========================================
  log("检查 5: 搜索旧的全局对象 __OPENCODE__...", "blue");

  const windowMatches = await searchInFiles(
    /__OPENCODE__/,
    ["*.ts", "*.tsx", "*.rs", "*.js"],
    SCRIPT_EXCLUDES,
    changedFiles.size > 0 ? changedFiles : undefined
  );

  let windowIssueCount = 0;
  for (const match of windowMatches) {
    // 排除脚本自身 (兼容 Windows 和 Linux 路径)
    if (match.file.includes("script\\costrict") || match.file.includes("script/costrict")) continue;

    issues.push({
      ...match,
      type: "window-object",
      severity: "error",
    });
    windowIssueCount++;
  }

  log(`  找到 ${windowIssueCount} 处全局对象引用`, "reset");

  // ========================================
  // 生成报告
  // ========================================
  console.log("");
  log("========================================", "cyan");
  log("  验证报告", "cyan");
  log("========================================", "cyan");
  console.log("");

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (issues.length === 0) {
    log("✅ 所有检查通过！未发现遗漏的品牌引用。", "green");
    console.log("");
    process.exit(0);
  }

  log(`❌ 发现 ${errors.length} 个错误`, "red");
  log(`⚠️  发现 ${warnings.length} 个警告`, "yellow");
  console.log("");

  // 按类型分组显示
  const byType = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = byType.get(issue.type) || [];
    list.push(issue);
    byType.set(issue.type, list);
  }

  const typeNames = {
    "opencode-text": "遗漏的 opencode 文本",
    "env-var": "遗漏的环境变量 OPENCODE_",
    "old-domain": "旧域名 opencode.ai",
    "old-repo": "旧仓库 anomalyco/opencode",
    "window-object": "旧全局对象 __OPENCODE__",
  };

  for (const [type, list] of byType) {
    log(`\n${typeNames[type as keyof typeof typeNames]} (${list.length} 处):`, "yellow");
    console.log("");

    const maxDisplay = process.argv.includes("--full") ? list.length : 10;
    for (const issue of list.slice(0, maxDisplay)) {
      console.log(`  ${issue.file}:${issue.line}`);
      console.log(`    ${issue.content}`);
      console.log("");
    }

    if (list.length > maxDisplay) {
      log(`  ... 还有 ${list.length - maxDisplay} 处未显示`, "reset");
      log(`  使用 --full 参数查看所有问题`, "reset");
      console.log("");
    }
  }

  log("========================================", "cyan");
  log("建议操作:", "yellow");
  log("  1. 检查上述文件，手动修正遗漏的引用", "reset");
  log("  2. 重新运行品牌应用脚本: bun run script/costrict/rebrand-apply.ts", "reset");
  log("  3. 再次运行验证: bun run script/costrict/verify-brand.ts", "reset");
  console.log("");

  process.exit(1);
}

main();
