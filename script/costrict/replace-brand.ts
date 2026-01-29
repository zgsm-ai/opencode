#!/usr/bin/env bun

/**
 * CoStrict 品牌自动应用脚本
 *
 * 功能：
 * 1. 幂等操作，可重复运行
 * 2. 每次同步上游后自动重新应用品牌修改
 * 3. 跨平台（Windows/Linux/macOS）
 *
 * 使用：
 *   bun run script/costrict/rebrand-apply.ts [--dry-run]
 *
 * 参数：
 *   --dry-run  预览模式，仅显示将修改的文件，不实际修改
 */

import { $ } from "bun";
import fs from "fs/promises";
import path from "path";
import { BRAND_CONFIG } from "./config";

// 检查是否为 dry-run 模式
const isDryRun = process.argv.includes("--dry-run");

// 颜色输出（跨平台）
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(text: string) {
  console.log("");
  log("========================================", "bright");
  log(`  ${text}`, "cyan");
  log("========================================", "bright");
  console.log("");
}

function phase(text: string) {
  console.log("");
  log(text, "blue");
}

function success(text: string) {
  log(`  ✓ ${text}`, "green");
}

function info(text: string) {
  log(`  ${text}`, "reset");
}

function warning(text: string) {
  log(`  ⚠️  ${text}`, "yellow");
}

// 文件存在性检查
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 文件替换工具
async function replaceInFile(
  filePath: string,
  replacements: Array<{ from: string | RegExp; to: string }>
): Promise<boolean> {
  try {
    let content = await fs.readFile(filePath, "utf-8");
    let modified = false;

    for (const { from, to } of replacements) {
      const before = content;
      if (typeof from === "string") {
        content = content.split(from).join(to);
      } else {
        content = content.replace(from, to);
      }
      if (content !== before) {
        modified = true;
      }
    }

    if (modified) {
      if (!isDryRun) {
        await fs.writeFile(filePath, content, "utf-8");
      } else {
        info(`[DRY-RUN] 将修改: ${filePath}`);
      }
      return true;
    }
    return false;
  } catch (error: any) {
    // 区分错误类型，对不同错误采取不同策略
    if (error.code === "ENOENT") {
      // 文件不存在 - 警告但继续（可能是 upstream 已删除）
      warning(`文件不存在，跳过: ${filePath}`);
      return false;
    } else if (error.code === "EACCES" || error.code === "EPERM") {
      // 权限错误 - 中断执行（严重问题）
      console.error("");
      log(`❌ 文件无权限访问: ${filePath}`, "red");
      log(`   错误代码: ${error.code}`, "red");
      log(`   请检查文件权限后重试`, "yellow");
      throw error;
    } else if (error.code === "EISDIR") {
      // 目标是目录而非文件 - 警告但继续
      warning(`跳过目录: ${filePath}`);
      return false;
    } else {
      // 未知错误 - 中断执行（可能是严重问题）
      console.error("");
      log(`❌ 处理文件失败: ${filePath}`, "red");
      log(`   错误类型: ${error.constructor.name}`, "red");
      log(`   错误信息: ${error.message}`, "red");
      throw error;
    }
  }
}

// 批量替换目录下的文件
async function replaceInDirectory(
  dir: string,
  pattern: string,
  replacements: Array<{ from: string | RegExp; to: string }>
) {
  const glob = new Bun.Glob(pattern);
  let count = 0;

  for await (const file of glob.scan(dir)) {
    const filePath = path.join(dir, file);
    const modified = await replaceInFile(filePath, replacements);
    if (modified) {
      count++;
      info(`修改: ${filePath}`);
    }
  }

  return count;
}

// ========================================
// Phase 0: Package.json 仓库信息更新（来自 rebrand-init.ts）
// ========================================
async function phase0PackageJsonRepo() {
  phase("Phase 0: 更新 package.json 仓库信息...");

  // 只更新 repository.url，不修改 name/bin/dependencies
  async function updateRepoUrl(filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const pkg = JSON.parse(content);
      let modified = false;

      // 仅更新 repository
      if (pkg.repository?.url) {
        const oldRepo = BRAND_CONFIG.old.repo;
        const newRepo = BRAND_CONFIG.new.repo;
        if (pkg.repository.url.includes(oldRepo)) {
          pkg.repository.url = pkg.repository.url.replace(oldRepo, newRepo);
          modified = true;
        }
      }

      if (modified && !isDryRun) {
        await fs.writeFile(filePath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
        return true;
      }
      return modified;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        warning(`文件不存在: ${filePath}`);
      }
      return false;
    }
  }

  // 根 package.json
  const rootModified = await updateRepoUrl("package.json");
  if (rootModified) {
    success("根 package.json 已更新");
  }

  // 查找所有子包
  const glob = new Bun.Glob("packages/**/package.json");
  let count = 0;
  for await (const file of glob.scan(".")) {
    if (!file.includes("node_modules")) {
      const modified = await updateRepoUrl(file);
      if (modified) {
        count++;
        info(`  ${file}`);
      }
    }
  }

  if (count > 0) {
    success(`更新了 ${count} 个子包`);
  }

  success("Phase 0 完成");
}

// ========================================
// Phase 1: 核心配置路径
// ========================================
async function phase1CoreConfig() {
  phase("Phase 1: 应用核心配置...");

  // 1.1 修改应用名（XDG 路径）
  const globalIndexPath = "packages/opencode/src/global/index.ts";

  if (!(await fileExists(globalIndexPath))) {
    warning(`未找到 ${globalIndexPath}，跳过此文件`);
  } else {
    info(`修改 ${globalIndexPath} 应用名...`);
    await replaceInFile(globalIndexPath, [
      { from: 'const app = "opencode"', to: `const app = "${BRAND_CONFIG.new.appName}"` },
    ]);
    success(`${globalIndexPath} 已更新`);
  }

  // 1.2 修改配置文件名
  const configPath = "packages/opencode/src/config/config.ts";

  if (!(await fileExists(configPath))) {
    warning(`未找到 ${configPath}，跳过此文件`);
  } else {
    info(`修改 ${configPath} 配置文件名...`);
    await replaceInFile(configPath, [
      { from: '"opencode.jsonc"', to: `"${BRAND_CONFIG.new.configFileName}.jsonc"` },
      { from: '"opencode.json"', to: `"${BRAND_CONFIG.new.configFileName}.json"` },
      { from: "https://opencode.ai/config.json", to: `https://${BRAND_CONFIG.new.domain}/config.json` },

      // 🔴 Critical: 用户数据目录路径 (.opencode → .costrict)
      { from: /\.opencode(?!-)/g, to: `.${BRAND_CONFIG.new.appName}` },
      { from: /endsWith\("\.opencode"\)/g, to: `endsWith(".${BRAND_CONFIG.new.appName}")` },
      { from: /\.opencode\//g, to: `.${BRAND_CONFIG.new.appName}/` },
    ]);
    success(`${configPath} 已更新`);
  }

  // 1.3 CLI 入口文件 - 智能检测和处理（来自 rebrand-init.ts）
  const oldCliPath = "packages/opencode/bin/opencode";
  const newCliPath = `packages/opencode/bin/${BRAND_CONFIG.new.cliName}`;
  const pkgJsonPath = "packages/opencode/package.json";

  const oldExists = await fileExists(oldCliPath);
  const newExists = await fileExists(newCliPath);

  if (oldExists && !newExists) {
    // 场景 1：首次运行，文件还未重命名 - 自动执行
    info("检测到 CLI 入口文件尚未重命名，正在自动处理...");

    if (!isDryRun) {
      try {
        // 1. 使用 git mv 重命名文件
        await $`git mv ${oldCliPath} ${newCliPath}`;
        success(`已重命名: ${oldCliPath} → ${newCliPath}`);
      } catch (e) {
        warning("git mv 失败，尝试直接重命名...");
        await fs.rename(oldCliPath, newCliPath);
        success(`已重命名（非 Git 跟踪）: ${oldCliPath} → ${newCliPath}`);
      }

      // 2. 更新 package.json 的 bin 字段
      try {
        const pkgContent = await fs.readFile(pkgJsonPath, "utf-8");
        const pkg = JSON.parse(pkgContent);

        if (pkg.bin && typeof pkg.bin === "object") {
          // 重命名 bin 键
          const oldBinPath = pkg.bin["opencode"];
          if (oldBinPath) {
            delete pkg.bin["opencode"];
            pkg.bin[BRAND_CONFIG.new.cliName] = oldBinPath.replace("opencode", BRAND_CONFIG.new.cliName);
            await fs.writeFile(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
            success(`已更新 ${pkgJsonPath} 的 bin 字段`);
          }
        }
      } catch (e) {
        warning(`更新 ${pkgJsonPath} 失败，请手动检查`);
      }
    } else {
      info("[DRY-RUN] 将执行以下操作:");
      info(`  1. git mv ${oldCliPath} ${newCliPath}`);
      info(`  2. 更新 ${pkgJsonPath} 的 bin 字段`);
    }
  }

  if (newExists || (oldExists && !isDryRun)) {
    // 场景 2：已重命名（或刚刚重命名），处理内容替换
    info(`处理 CLI 入口文件内容: ${newCliPath}...`);
    await replaceInFile(newCliPath, [
      { from: /OPENCODE_BIN_PATH/g, to: "COSTRICT_BIN_PATH" },
      { from: /opencode-/g, to: `${BRAND_CONFIG.new.cliName}-` },
      { from: /opencode\.exe/g, to: `${BRAND_CONFIG.new.cliName}.exe` },
      { from: /: "opencode"/g, to: `: "${BRAND_CONFIG.new.cliName}"` },
      { from: "opencode CLI", to: "CoStrict CLI" },
    ]);
    success(`${newCliPath} 内容已更新`);
  } else if (!oldExists && !newExists) {
    // 场景 3：两个文件都不存在（可能是 upstream 删除/移动）
    warning("未找到 CLI 入口文件（无论新旧路径）");
    warning("upstream 可能已删除或移动此文件，请手动检查");
  }

  success("Phase 1 完成");
}

// ========================================
// Phase 2: 环境变量
// ========================================
async function phase2EnvVars() {
  phase("Phase 2: 替换环境变量...");

  // 2.1 flag.ts（最关键）
  info("修改 flag.ts...");
  await replaceInFile("packages/opencode/src/flag/flag.ts", [
    { from: /OPENCODE_/g, to: "COSTRICT_" },
  ]);
  success("flag.ts 已更新");

  // 2.2 其他 TypeScript 文件
  info("批量替换 TypeScript 文件中的环境变量...");

  const dirs = [
    "packages/opencode/src",
    "packages/sdk/js/src",
    "packages/enterprise/src",
    "packages/desktop/src",
    "packages/app/src",
    "sdks/vscode/src",
  ];

  for (const dir of dirs) {
    const count = await replaceInDirectory(dir, "**/*.{ts,tsx}", [
      { from: /OPENCODE_/g, to: "COSTRICT_" },
      { from: /__OPENCODE__/g, to: "__COSTRICT__" },
    ]);
    if (count > 0) {
      success(`${dir} - ${count} 个文件已更新`);
    }
  }

  // 2.2a 额外的配置文件
  const extraConfigFiles = [
    "packages/enterprise/vite.config.ts",
    "infra/enterprise.ts",
  ];

  for (const file of extraConfigFiles) {
    if (await fileExists(file)) {
      info(`更新 ${file}...`);
      await replaceInFile(file, [
        { from: /OPENCODE_/g, to: "COSTRICT_" },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 2.3 GitHub Actions 和 Docker 镜像引用
  const githubActionsPath = "packages/opencode/src/cli/cmd/github.ts";
  if (await fileExists(githubActionsPath)) {
    info(`修改 ${githubActionsPath} GitHub Actions 引用...`);
    await replaceInFile(githubActionsPath, [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]);
    success(`${githubActionsPath} 已更新`);
  } else {
    info(`跳过: ${githubActionsPath} (文件不存在)`);
  }

  const tipsPath = "packages/opencode/src/cli/cmd/tui/component/tips.ts";
  if (await fileExists(tipsPath)) {
    info(`修改 ${tipsPath} Docker 镜像引用...`);
    await replaceInFile(tipsPath, [
      { from: /ghcr\.io\/anomalyco\/opencode/g, to: `ghcr.io/${BRAND_CONFIG.new.repo}` },
    ]);
    success(`${tipsPath} 已更新`);
  } else {
    info(`跳过: ${tipsPath} (文件不存在)`);
  }

  const publishRegistriesPath = "packages/opencode/script/publish-registries.ts";
  if (await fileExists(publishRegistriesPath)) {
    info(`修改 ${publishRegistriesPath}...`);
    await replaceInFile(publishRegistriesPath, [
      { from: /OPENCODE_/g, to: "COSTRICT_" },
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]);
    success(`${publishRegistriesPath} 已更新`);
  } else {
    info(`跳过: ${publishRegistriesPath} (文件不存在)`);
  }

  // 2.4 其他包含仓库引用的文件
  const repoFiles = [
    "packages/opencode/script/publish.ts",
    "packages/console/app/src/config.ts",
    "packages/console/app/src/routes/openapi.json.ts",
    "packages/console/app/src/routes/download/[platform].ts",
    "packages/opencode/src/cli/cmd/tui/app.tsx",
    "packages/enterprise/src/routes/share/[shareID].tsx",
    "packages/console/app/src/routes/temp.tsx",
    "packages/console/app/src/routes/[...404].tsx",
  ];

  for (const file of repoFiles) {
    if (await fileExists(file)) {
      info(`更新 ${file}...`);
      await replaceInFile(file, [
        { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
      ]);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 2.5 Tauri 配置中的更新端点
  const tauriProdConfigPath = "packages/desktop/src-tauri/tauri.prod.conf.json";
  if (await fileExists(tauriProdConfigPath)) {
    info(`修改 ${tauriProdConfigPath}...`);
    await replaceInFile(tauriProdConfigPath, [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]);
    success(`${tauriProdConfigPath} 已更新`);
  }

  // 2.6 CONTRIBUTING.md
  const contributingPath = "CONTRIBUTING.md";
  if (await fileExists(contributingPath)) {
    info(`修改 ${contributingPath}...`);
    await replaceInFile(contributingPath, [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]);
    success(`${contributingPath} 已更新`);
  }

  success("Phase 2 完成");
}

// ========================================
// Phase 3: Rust 文件（桌面应用）
// ========================================
async function phase3RustFiles() {
  phase("Phase 3: 替换 Rust 文件...");

  // 3.1 批量替换环境变量
  info("修改 Tauri Rust 文件...");
  const rustCount = await replaceInDirectory("packages/desktop/src-tauri/src", "**/*.rs", [
    { from: /OPENCODE_/g, to: "COSTRICT_" },
    { from: /__OPENCODE__/g, to: "__COSTRICT__" },
  ]);

  if (rustCount > 0) {
    success(`${rustCount} 个 Rust 文件已更新`);
  }

  // 3.2 cli.rs - CLI 二进制文件名和临时脚本名
  const cliRsPath = "packages/desktop/src-tauri/src/cli.rs";
  if (await fileExists(cliRsPath)) {
    info(`更新 ${cliRsPath}...`);
    await replaceInFile(cliRsPath, [
      // 🔴 Critical: CLI 二进制文件名常量
      { from: /const CLI_BINARY_NAME: &str = "opencode";/g, to: `const CLI_BINARY_NAME: &str = "${BRAND_CONFIG.new.cliName}";` },

      // 🔴 Critical: 临时安装脚本名
      { from: /opencode-install\.sh/g, to: `${BRAND_CONFIG.new.appName}-install.sh` },
    ]);
    success(`${cliRsPath} 已更新`);
  } else {
    info(`跳过: ${cliRsPath} (文件不存在)`);
  }

  // 3.3 lib.rs - 应用标题和错误消息
  const libRsPath = "packages/desktop/src-tauri/src/lib.rs";
  if (await fileExists(libRsPath)) {
    info(`更新 ${libRsPath}...`);
    await replaceInFile(libRsPath, [
      // 🔴 Critical: 窗口标题
      { from: /\.title\("OpenCode"\)/g, to: `.title("${BRAND_CONFIG.new.productName}")` },

      // 🔴 Critical: 错误消息中的品牌名
      { from: /Failed to spawn OpenCode Server/g, to: `Failed to spawn ${BRAND_CONFIG.new.productName} Server` },
    ]);
    success(`${libRsPath} 已更新`);
  } else {
    info(`跳过: ${libRsPath} (文件不存在)`);
  }

  success("Phase 3 完成");
}

// ========================================
// Phase 4: 域名替换
// ========================================
async function phase4Domains() {
  phase("Phase 4: 替换域名...");

  // 4.1 share.ts（API 域名）
  info("修改 share.ts API 域名...");
  await replaceInFile("packages/opencode/src/share/share.ts", [
    { from: "https://api.opencode.ai", to: `https://${BRAND_CONFIG.new.apiDomain}` },
    { from: "https://api.dev.opencode.ai", to: `https://${BRAND_CONFIG.new.apiDomain}` },
  ]);
  success("share.ts 已更新");

  // 4.2 批量替换主域名
  info(`批量替换主域名 ${BRAND_CONFIG.old.domain} → ${BRAND_CONFIG.new.domain}...`);
  const domainDirs = [
    "packages/opencode/src",
    "packages/web/src",
    "packages/sdk/js/src",
    "packages/console",
    "packages/enterprise/src",
    "packages/desktop/src",
    "packages/app/src",
  ];

  for (const dir of domainDirs) {
    const count = await replaceInDirectory(dir, "**/*.{ts,tsx,mdx}", [
      { from: new RegExp(`https://${BRAND_CONFIG.old.domain.replace('.', '\\.')}`, 'g'), to: `https://${BRAND_CONFIG.new.domain}` },
      { from: new RegExp(BRAND_CONFIG.old.domain.replace('.', '\\.'), 'g'), to: BRAND_CONFIG.new.domain },
    ]);
    if (count > 0) {
      success(`${dir} - ${count} 个文件已更新`);
    }
  }

  // 4.2a 基础设施配置
  const infraFiles = [
    "infra/stage.ts",
    "github/index.ts",
  ];

  for (const file of infraFiles) {
    if (await fileExists(file)) {
      info(`更新 ${file}...`);
      await replaceInFile(file, [
        { from: /https:\/\/api\.opencode\.ai/g, to: `https://${BRAND_CONFIG.new.apiDomain}` },
        { from: new RegExp(`https://${BRAND_CONFIG.old.domain.replace('.', '\\.')}`, 'g'), to: `https://${BRAND_CONFIG.new.domain}` },
        { from: new RegExp(`dev\\.${BRAND_CONFIG.old.domain.replace('.', '\\.')}`, 'g'), to: `dev.${BRAND_CONFIG.new.domain}` },
        { from: new RegExp(BRAND_CONFIG.old.domain.replace('.', '\\.'), 'g'), to: BRAND_CONFIG.new.domain },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 4.3 主题 Schema URL 替换
  info("替换主题 Schema URL...");
  const themeDir = "packages/opencode/src/cli/cmd/tui/context/theme";
  const themeCount = await replaceInDirectory(themeDir, "**/*.json", [
    { from: new RegExp(`"https://${BRAND_CONFIG.old.domain.replace('.', '\\.')}/theme\\.json"`, 'g'), to: `"https://${BRAND_CONFIG.new.domain}/theme.json"` },
  ]);

  if (themeCount > 0) {
    success(`${themeCount} 个主题文件 Schema 已更新`);
  } else {
    info("未找到需要更新的主题 Schema");
  }

  success("Phase 4 完成");
}

// ========================================
// Phase 5: 文档
// ========================================
async function phase5Docs() {
  phase("Phase 5: 更新文档...");

  // 5.1 README 文件
  info("更新 README 文件...");
  const readmeFiles = await Array.fromAsync(new Bun.Glob("README*.md").scan("."));

  for (const file of readmeFiles) {
    await replaceInFile(file, [
      // 产品名: OpenCode → CoStrict
      { from: new RegExp(BRAND_CONFIG.old.productName, 'g'), to: BRAND_CONFIG.new.productName },

      // npm 包名: opencode-ai → costrict-ai (注意: 不是 costrict-alpha-ai!)
      { from: new RegExp(`\\b${BRAND_CONFIG.old.npmPackageName}\\b`, 'g'), to: BRAND_CONFIG.new.npmPackageName },

      // CLI 命令名: opencode → costrict-alpha (用户执行的命令)
      { from: new RegExp(`\\b${BRAND_CONFIG.old.cliName}(?![-\\.])`, 'g'), to: BRAND_CONFIG.new.cliName },

      // 域名: opencode.ai → costrict.ai
      { from: new RegExp(`https://${BRAND_CONFIG.old.domain.replace('.', '\\.')}`, 'g'), to: `https://${BRAND_CONFIG.new.domain}` },
      { from: new RegExp(BRAND_CONFIG.old.domain.replace('.', '\\.'), 'g'), to: BRAND_CONFIG.new.domain },

      // 仓库: anomalyco/opencode → wantWhatBike/costrict-alpha
      { from: new RegExp(BRAND_CONFIG.old.repo.replace('/', '\\/'), 'g'), to: BRAND_CONFIG.new.repo },
    ]);
    success(file);
  }

  // 5.2 文档站点
  info("更新文档站点 .mdx 文件...");
  const docsCount = await replaceInDirectory("packages/web/src/content/docs", "**/*.mdx", [
    { from: new RegExp(BRAND_CONFIG.old.productName, 'g'), to: BRAND_CONFIG.new.productName },
    { from: new RegExp(`${BRAND_CONFIG.old.cliName}(?!\\.)`, 'g'), to: BRAND_CONFIG.new.cliName },
    { from: new RegExp(BRAND_CONFIG.old.repo.replace('/', '\\/'), 'g'), to: BRAND_CONFIG.new.repo },
  ]);
  success(`${docsCount} 个文档文件已更新`);

  success("Phase 5 完成");
}

// ========================================
// Phase 6: GitHub Actions 工作流
// ========================================
async function phase6Workflows() {
  phase("Phase 6: 更新 GitHub Actions 工作流...");

  const workflowCount = await replaceInDirectory(".github/workflows", "**/*.yml", [
    { from: /OPENCODE_/g, to: "COSTRICT_" },
  ]);

  if (workflowCount > 0) {
    success(`${workflowCount} 个工作流文件已更新`);
  }

  log("", "reset");
  log("  ⚠️  注意：需要在 GitHub 仓库设置中添加新的 Secret:", "yellow");
  log("     Settings > Secrets and variables > Actions", "yellow");
  log("     Name: COSTRICT_API_KEY", "yellow");
  log("     Value: (从旧的 OPENCODE_API_KEY 复制)", "yellow");

  success("Phase 6 完成");
}

// ========================================
// Phase 7: 构建和发布脚本
// ========================================
async function phase7BuildScripts() {
  phase("Phase 7: 更新构建和发布脚本...");

  // 7.1 CLI 构建脚本（最关键）
  const buildScriptPath = "packages/opencode/script/build.ts";

  if (!(await fileExists(buildScriptPath))) {
    warning(`未找到 ${buildScriptPath}，跳过此文件`);
    warning("upstream 可能已移动或删除此文件，请手动检查");
  } else {
    info(`修改 ${buildScriptPath}...`);
    await replaceInFile(buildScriptPath, [
      // 编译时常量
      { from: /OPENCODE_VERSION/g, to: "COSTRICT_VERSION" },
      { from: /OPENCODE_/g, to: "COSTRICT_" },
      // 输出路径
      { from: /opencode-\$/g, to: `${BRAND_CONFIG.new.cliName}-$` },
      { from: /\/bin\/opencode/g, to: `/bin/${BRAND_CONFIG.new.cliName}` },
      // User Agent
      { from: /"--user-agent=opencode\//g, to: `"--user-agent=${BRAND_CONFIG.new.cliName}/` },
    ]);
    success(`${buildScriptPath} 已更新`);
  }

  // 7.2 Script 包
  const scriptIndexPath = "packages/script/src/index.ts";

  if (await fileExists(scriptIndexPath)) {
    info(`更新 ${scriptIndexPath}...`);
    await replaceInFile(scriptIndexPath, [
      { from: /OPENCODE_/g, to: "COSTRICT_" },
    ]);
    success(`${scriptIndexPath} 已更新`);
  } else {
    info(`跳过: ${scriptIndexPath} (文件不存在)`);
  }

  // 7.3 根目录脚本
  // 注意：保持 packages/opencode 目录名和 @opencode-ai/* 包名不变
  // 只替换仓库引用和发布产物名称
  const rootScripts = [
    { file: "script/changelog.ts", replacements: [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]},
    { file: "script/stats.ts", replacements: [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]},
    { file: "script/publish-complete.ts", replacements: [
      { from: /opencode-linux/g, to: `${BRAND_CONFIG.new.cliName}-linux` },
      { from: /opencode-darwin/g, to: `${BRAND_CONFIG.new.cliName}-darwin` },
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]},
    { file: "script/publish-start.ts", replacements: [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]},
  ];

  for (const { file, replacements } of rootScripts) {
    if (await fileExists(file)) {
      info(`更新 ${file}...`);
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 7.4 packages/opencode/src/installation/index.ts - 安装命令
  const installationPath = "packages/opencode/src/installation/index.ts";
  if (await fileExists(installationPath)) {
    info(`更新 ${installationPath}...`);
    await replaceInFile(installationPath, [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },

      // 🔴 Critical: npm 安装命令中的包名
      { from: /npm install -g opencode-ai/g, to: `npm install -g ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /npm i -g opencode-ai/g, to: `npm i -g ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /npm uninstall -g opencode-ai/g, to: `npm uninstall -g ${BRAND_CONFIG.new.npmPackageName}` },

      // 🔴 Critical: pnpm 安装命令
      { from: /pnpm add -g opencode-ai/g, to: `pnpm add -g ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /pnpm remove -g opencode-ai/g, to: `pnpm remove -g ${BRAND_CONFIG.new.npmPackageName}` },

      // 🔴 Critical: yarn 安装命令
      { from: /yarn global add opencode-ai/g, to: `yarn global add ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /yarn global remove opencode-ai/g, to: `yarn global remove ${BRAND_CONFIG.new.npmPackageName}` },

      // 🔴 Critical: bun 安装命令
      { from: /bun add -g opencode-ai/g, to: `bun add -g ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /bun remove -g opencode-ai/g, to: `bun remove -g ${BRAND_CONFIG.new.npmPackageName}` },
    ]);
    success(`${installationPath} 已更新`);
  } else {
    info(`跳过: ${installationPath} (文件不存在)`);
  }

  // 7.4a uninstall.ts - 卸载命令
  const uninstallPath = "packages/opencode/src/cli/cmd/uninstall.ts";
  if (await fileExists(uninstallPath)) {
    info(`更新 ${uninstallPath}...`);
    await replaceInFile(uninstallPath, [
      // 🔴 Critical: npm 卸载命令
      { from: /npm uninstall -g opencode-ai/g, to: `npm uninstall -g ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /npm remove -g opencode-ai/g, to: `npm remove -g ${BRAND_CONFIG.new.npmPackageName}` },

      // 其他包管理器
      { from: /pnpm remove -g opencode-ai/g, to: `pnpm remove -g ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /yarn global remove opencode-ai/g, to: `yarn global remove ${BRAND_CONFIG.new.npmPackageName}` },
      { from: /bun remove -g opencode-ai/g, to: `bun remove -g ${BRAND_CONFIG.new.npmPackageName}` },

      // 🔴 Critical: Shell 配置文件注释检查
      { from: /"# opencode"/g, to: `"# ${BRAND_CONFIG.new.appName}"` },
      { from: /includes\("# opencode"\)/g, to: `includes("# ${BRAND_CONFIG.new.appName}")` },
    ]);
    success(`${uninstallPath} 已更新`);
  } else {
    info(`跳过: ${uninstallPath} (文件不存在)`);
  }

  // 7.5 测试文件
  info("更新测试文件...");
  const testCount = await replaceInDirectory("packages/opencode/test", "**/*.ts", [
    { from: /OPENCODE_/g, to: "COSTRICT_" },
    { from: /https:\/\/opencode\.ai\/config\.json/g, to: "https://costrict.ai/config.json" },
    // 🔴 修复: 测试文件中的 .opencode 路径
    { from: /"\.opencode\//g, to: `".${BRAND_CONFIG.new.userDataDir}/` },
    { from: /\.opencode\//g, to: `.${BRAND_CONFIG.new.userDataDir}/` },
    { from: /"\.opencode"/g, to: `".${BRAND_CONFIG.new.userDataDir}"` },
    // path.join(dir, ".opencode") 模式
    { from: /,\s*"\.opencode"\)/g, to: `, ".${BRAND_CONFIG.new.userDataDir}")` },
  ]);
  if (testCount > 0) {
    success(`${testCount} 个测试文件已更新`);
  }

  // 7.6 packages/opencode/script/publish-registries.ts (发布到 AUR/Homebrew)
  const publishRegistriesPath = "packages/opencode/script/publish-registries.ts";
  if (await fileExists(publishRegistriesPath)) {
    info(`更新 ${publishRegistriesPath}...`);
    await replaceInFile(publishRegistriesPath, [
      // 环境变量
      { from: /OPENCODE_/g, to: "COSTRICT_" },

      // 仓库引用
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },

      // ⚠️ 关键: 下载URL中的文件名 (tar.gz/zip)
      { from: /\/opencode-linux-arm64\.tar\.gz/g, to: `/${BRAND_CONFIG.new.cliName}-linux-arm64.tar.gz` },
      { from: /\/opencode-linux-x64\.tar\.gz/g, to: `/${BRAND_CONFIG.new.cliName}-linux-x64.tar.gz` },
      { from: /\/opencode-darwin-arm64\.zip/g, to: `/${BRAND_CONFIG.new.cliName}-darwin-arm64.zip` },
      { from: /\/opencode-darwin-x64\.zip/g, to: `/${BRAND_CONFIG.new.cliName}-darwin-x64.zip` },

      // 压缩包变量引用
      { from: /opencode-\$\{pkgver\}/g, to: `${BRAND_CONFIG.new.cliName}-\${pkgver}` },
      { from: /opencode-\$\{version\}/g, to: `${BRAND_CONFIG.new.cliName}-\${version}` },

      // 🔴 Critical: AUR PKGBUILD install 命令中的源文件路径
      { from: /install -Dm755 \.\/opencode /g, to: `install -Dm755 ./${BRAND_CONFIG.new.cliName} ` },

      // AUR PKGBUILD 中的路径和文件名
      { from: /dist\/opencode-linux/g, to: `dist/${BRAND_CONFIG.new.cliName}-linux` },
      { from: /bin\/opencode"/g, to: `bin/${BRAND_CONFIG.new.cliName}"` },

      // Homebrew Formula 中的产物名
      { from: /opencode-\$\{platform\}/g, to: `${BRAND_CONFIG.new.cliName}-\${platform}` },
    ]);
    success(`${publishRegistriesPath} 已更新`);
  } else {
    info(`跳过: ${publishRegistriesPath} (文件不存在)`);
  }

  // 7.7 Nix 脚本（可选）
  const nixFiles = ["nix/bundle.ts", "nix/opencode.nix", "nix/scripts/bun-build.ts"];
  for (const file of nixFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        { from: /OPENCODE_/g, to: "COSTRICT_" },
      ]);
      success(file);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  success("Phase 7 完成");
}

// ========================================
// Phase 8: Turborepo 和其他配置
// ========================================
async function phase8Configs() {
  phase("Phase 8: 更新 Turborepo 和其他配置...");

  // 8.1 turbo.json
  const turboJsonPath = "turbo.json";

  if (!(await fileExists(turboJsonPath))) {
    info(`跳过: ${turboJsonPath} (文件不存在)`);
    info("项目可能不使用 Turborepo");
  } else {
    // ⚠️ 不修改 turbo 任务名!
    // 任务名格式是 "包名#任务名", 应该匹配 packages/opencode/package.json 的 name 字段
    // 由于我们保持内部包名为 "opencode" (避免合并冲突), turbo 任务名也应保持 "opencode#*"
    info(`${turboJsonPath} - 保持任务名为 opencode#* (匹配内部包名)`);
    log("  理由: 内部包名保持 'opencode' 不变, 以便于合并上游更新", "yellow");
  }

  // 8.2 sst.config.ts
  const sstConfigPath = "sst.config.ts";
  if (await fileExists(sstConfigPath)) {
    info(`修改 ${sstConfigPath}...`);
    await replaceInFile(sstConfigPath, [
      { from: /name:\s*"opencode"/g, to: `name: "${BRAND_CONFIG.new.cliName}"` },
    ]);
    success(`${sstConfigPath} 已更新`);
  } else {
    info(`跳过: ${sstConfigPath} (文件不存在)`);
  }

  // 8.3 VS Code 扩展源代码
  const vscodeExtPath = "sdks/vscode/src/extension.ts";
  if (await fileExists(vscodeExtPath)) {
    info(`修改 ${vscodeExtPath}...`);
    await replaceInFile(vscodeExtPath, [
      { from: /const TERMINAL_NAME = "opencode"/g, to: `const TERMINAL_NAME = "${BRAND_CONFIG.new.cliName}"` },
      { from: /"opencode\./g, to: `"${BRAND_CONFIG.new.cliName}.` },
      { from: /opencode terminal/gi, to: `${BRAND_CONFIG.new.cliName} terminal` },
      { from: /terminal\.sendText\(`opencode /g, to: `terminal.sendText(\`${BRAND_CONFIG.new.cliName} ` },
    ]);
    success(`${vscodeExtPath} 已更新`);
  } else {
    info(`跳过: ${vscodeExtPath} (文件不存在)`);
  }

  // 8.3a VS Code 扩展 package.json
  const vscodePackageJsonPath = "sdks/vscode/package.json";
  if (await fileExists(vscodePackageJsonPath)) {
    info(`修改 ${vscodePackageJsonPath}...`);
    await replaceInFile(vscodePackageJsonPath, [
      // 🔴 Critical: 扩展描述
      { from: /"description":\s*"opencode for VS Code"/g, to: `"description": "${BRAND_CONFIG.new.cliName} for VS Code"` },

      // 🔴 Critical: 命令标题
      { from: /"title":\s*"Open opencode"/g, to: `"title": "Open ${BRAND_CONFIG.new.cliName}"` },
      { from: /"title":\s*"Open opencode in new tab"/g, to: `"title": "Open ${BRAND_CONFIG.new.cliName} in new tab"` },
      { from: /"title":\s*"Run opencode"/g, to: `"title": "Run ${BRAND_CONFIG.new.cliName}"` },

      // 🔴 Critical: 仓库 URL
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]);
    success(`${vscodePackageJsonPath} 已更新`);
  } else {
    info(`跳过: ${vscodePackageJsonPath} (文件不存在)`);
  }

  // 8.4 SDK 文档
  const sdkReadmeFiles = [
    "sdks/vscode/README.md",
    "github/README.md",
  ];

  for (const file of sdkReadmeFiles) {
    if (await fileExists(file)) {
      info(`修改 ${file}...`);
      await replaceInFile(file, [
        { from: new RegExp(`https://${BRAND_CONFIG.old.domain.replace('.', '\\.')}`, 'g'), to: `https://${BRAND_CONFIG.new.domain}` },
        { from: new RegExp(BRAND_CONFIG.old.domain.replace('.', '\\.'), 'g'), to: BRAND_CONFIG.new.domain },
        { from: new RegExp(BRAND_CONFIG.old.repo.replace('/', '\\/'), 'g'), to: BRAND_CONFIG.new.repo },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 8.5 GitHub Action 配置文件
  const githubActionFiles = [
    { file: "github/README.md", replacements: [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]},
    { file: "github/action.yml", replacements: [
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
    ]},
  ];

  for (const { file, replacements } of githubActionFiles) {
    if (await fileExists(file)) {
      info(`更新 ${file}...`);
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 8.6 GitHub Action 源代码 (github/index.ts)
  const githubIndexPath = "github/index.ts";
  if (await fileExists(githubIndexPath)) {
    info(`更新 ${githubIndexPath}...`);
    await replaceInFile(githubIndexPath, [
      // 🔴 Critical: 命令识别正则表达式 (支持更复杂的正则格式)
      { from: /\/opencode(?=\||\\|)/g, to: `/${BRAND_CONFIG.new.cliName}` },
    ]);
    success(`${githubIndexPath} 已更新`);
  } else {
    info(`跳过: ${githubIndexPath} (文件不存在)`);
  }

  success("Phase 8 完成");
}

// ========================================
// Phase 9: 用户可见字符串
// ========================================
async function phase9UserFacingStrings() {
  phase("Phase 9: 替换用户可见字符串...");

  // 9.1 Console 核心模块 - 只处理特定的用户可见字符串,不触碰 import
  info("处理 Console 核心模块...");
  const awsFile = "packages/console/core/src/aws.ts";
  if (await fileExists(awsFile)) {
    await replaceInFile(awsFile, [
      // 只替换邮件发送者名称,不触碰 import 语句
      { from: /FromEmailAddress:\s*`OpenCode\s+(\w+)/g, to: `FromEmailAddress: \`${BRAND_CONFIG.new.productName} $1` },
    ]);
    success(`${awsFile} 已更新 (仅邮件发送者)`);
  }

  const billingFile = "packages/console/core/src/billing.ts";
  if (await fileExists(billingFile)) {
    await replaceInFile(billingFile, [
      // 只替换用户可见的文本
      { from: /"opencode credits"/g, to: `"${BRAND_CONFIG.new.appName} credits"` },
    ]);
    success(`${billingFile} 已更新 (仅显示文本)`);
  }

  const userFile = "packages/console/core/src/user.ts";
  if (await fileExists(userFile)) {
    await replaceInFile(userFile, [
      // 🔴 Critical: 邮件主题中的品牌名
      { from: /workspace on OpenCode/g, to: `workspace on ${BRAND_CONFIG.new.productName}` },
    ]);
    success(`${userFile} 已更新 (邮件主题)`);
  }

  // 9.2 Console 应用路由 (营销页面、下载页等)
  info("处理 Console 应用页面...");
  const consoleRoutes = [
    "packages/console/app/src/routes",
    "packages/console/app/src/component",
  ];

  for (const dir of consoleRoutes) {
    if (await fileExists(dir)) {
      const count = await replaceInDirectory(dir, "**/*.{ts,tsx}", [
        { from: /OpenCode(?!['"])/g, to: BRAND_CONFIG.new.productName }, // OpenCode -> CoStrict (但不替换引号中的)
        { from: /\bopencode\s+/g, to: `${BRAND_CONFIG.new.appName} ` }, // "opencode mcp" -> "costrict mcp"
      ]);
      if (count > 0) {
        success(`${dir} - ${count} 个文件已更新`);
      }
    }
  }

  // 9.3 Console 邮件模板
  info("处理 Console 邮件模板...");
  const mailTemplatesDir = "packages/console/mail/emails/templates";
  if (await fileExists(mailTemplatesDir)) {
    const count = await replaceInDirectory(mailTemplatesDir, "**/*.tsx", [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
    ]);
    if (count > 0) {
      success(`邮件模板 - ${count} 个文件已更新`);
    }
  }

  // 9.4 CLI 用户提示和帮助文本
  info("处理 CLI 用户提示...");
  const cliFiles = [
    "packages/opencode/src/cli/cmd/tui/component/tips.tsx",
    "packages/opencode/src/cli/cmd/tui/app.tsx",
    "packages/opencode/src/cli/cmd/mcp.ts",
    "packages/opencode/src/cli/cmd/pr.ts",
    "packages/opencode/src/cli/cmd/uninstall.ts",
    "packages/opencode/src/cli/cmd/auth.ts",
    "packages/opencode/src/cli/error.ts",
  ];

  for (const file of cliFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
        { from: /\bopencode\s+/g, to: `${BRAND_CONFIG.new.cliName} ` }, // CLI 命令提示
        { from: /`opencode\s+/g, to: `\`${BRAND_CONFIG.new.cliName} ` }, // 反引号中的命令
        { from: /"opencode\s+/g, to: `"${BRAND_CONFIG.new.cliName} ` }, // 双引号中的命令

        // 🔴 Critical: 用户数据目录路径 (.opencode → .costrict)
        { from: /\.opencode\//g, to: `.${BRAND_CONFIG.new.appName}/` },
        { from: /includes\("\.opencode"\)/g, to: `includes(".${BRAND_CONFIG.new.appName}")` },
        { from: /endsWith\("\.opencode"\)/g, to: `endsWith(".${BRAND_CONFIG.new.appName}")` },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 9.5 Server/API 描述字符串
  info("处理 Server/API 描述...");
  const serverFiles = [
    "packages/opencode/src/server/server.ts",
    "packages/opencode/src/server/project.ts",
    "packages/opencode/src/mcp/index.ts",
    "packages/opencode/src/mcp/oauth-callback.ts",
    "packages/opencode/src/plugin/codex.ts",
    "packages/opencode/src/plugin/index.ts",
  ];

  for (const file of serverFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
        { from: /\bopencode\s+/g, to: `${BRAND_CONFIG.new.cliName} ` },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 9.6 Agent 和权限配置文件
  info("处理 Agent 和权限配置...");
  const agentFiles = [
    "packages/opencode/src/agent/agent.ts",
    "packages/opencode/src/cli/cmd/agent.ts",
  ];

  for (const file of agentFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
        { from: /\bopencode\s+/g, to: `${BRAND_CONFIG.new.cliName} ` },

        // 🔴 Critical: Agent 配置中的 .opencode 路径
        { from: /\.opencode\//g, to: `.${BRAND_CONFIG.new.userDataDir}/` },
        { from: /"\.opencode\//g, to: `".${BRAND_CONFIG.new.userDataDir}/` },
        // 🔴 修复: 不带斜杠的 .opencode 路径
        { from: /"\.opencode"/g, to: `".${BRAND_CONFIG.new.userDataDir}"` },
        { from: /\.opencode"/g, to: `.${BRAND_CONFIG.new.userDataDir}"` },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 9.7 Theme 和 TUI 上下文
  info("处理 Theme 和 TUI 上下文...");
  const themeFile = "packages/opencode/src/cli/cmd/tui/context/theme.tsx";
  if (await fileExists(themeFile)) {
    await replaceInFile(themeFile, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🔴 Critical: Theme 文件系统目标路径
      { from: /targets:\s*\["\.opencode"\]/g, to: `targets: [".${BRAND_CONFIG.new.appName}"]` },

      // 🟡 Medium: Theme 引用名 (保留为内部标识符,不影响功能)
      // store.themes.opencode 保持不变,作为默认主题的内部ID
    ]);
    success(`${themeFile} 已更新`);
  }

  // 9.7.1 Ripgrep 文件搜索排除规则
  info("处理 Ripgrep 搜索排除规则...");
  const ripgrepFile = "packages/opencode/src/file/ripgrep.ts";
  if (await fileExists(ripgrepFile)) {
    await replaceInFile(ripgrepFile, [
      // 🔴 Critical: 文件搜索排除 .opencode 目录
      { from: /\.includes\(["']\.opencode["']\)/g, to: `.includes(".${BRAND_CONFIG.new.userDataDir}")` },
    ]);
    success(`${ripgrepFile} 已更新`);
  }

  // 9.8 OpenAPI 文档
  info("处理 OpenAPI 文档...");
  const openapiFile = "packages/sdk/openapi.json";
  if (await fileExists(openapiFile)) {
    await replaceInFile(openapiFile, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      { from: /opencode/g, to: BRAND_CONFIG.new.appName },
    ]);
    success(`${openapiFile} 已更新`);
  }

  // 9.9 UI 组件和 Web 应用
  info("处理 UI 组件和 Web 应用...");
  const uiDirs = [
    "packages/ui/src",
    "packages/web/src",
    "packages/app/src",
  ];

  for (const dir of uiDirs) {
    if (await fileExists(dir)) {
      const count = await replaceInDirectory(dir, "**/*.{ts,tsx}", [
        { from: /OpenCode(?!['"])/g, to: BRAND_CONFIG.new.productName },
      ]);
      if (count > 0) {
        success(`${dir} - ${count} 个文件已更新`);
      }
    }
  }

  // 9.9a UI 组件特殊文件补充
  const pierreIndexPath = "packages/ui/src/pierre/index.ts";
  if (await fileExists(pierreIndexPath)) {
    await replaceInFile(pierreIndexPath, [
      { from: /theme:\s*"OpenCode"/g, to: `theme: "${BRAND_CONFIG.new.productName}"` },
    ]);
    success(`${pierreIndexPath} 已更新 (主题名)`);
  }

  const dialogProviderPath = "packages/opencode/src/cli/cmd/tui/component/dialog-provider.tsx";
  if (await fileExists(dialogProviderPath)) {
    await replaceInFile(dialogProviderPath, [
      { from: /OpenCode\s+Zen/g, to: `${BRAND_CONFIG.new.productName} Zen` },
    ]);
    success(`${dialogProviderPath} 已更新 (Zen 提示)`);
  }

  // 9.10 Desktop 应用相关
  info("处理 Desktop 应用...");
  const desktopFiles = [
    "packages/desktop/src/cli.ts",
    "packages/desktop/src/menu.ts",
    "packages/desktop/src/updater.ts",
    "packages/desktop/scripts/copy-bundles.ts",
    "packages/desktop/scripts/prepare.ts",
    "packages/desktop/scripts/utils.ts",
  ];

  for (const file of desktopFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
        { from: /\bopencode\s+/g, to: `${BRAND_CONFIG.new.cliName} ` },
        { from: /'opencode'/g, to: `'${BRAND_CONFIG.new.cliName}'` },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 9.11 ACP Agent
  info("处理 ACP Agent...");
  const acpAgentFile = "packages/opencode/src/acp/agent.ts";
  if (await fileExists(acpAgentFile)) {
    await replaceInFile(acpAgentFile, [
      { from: /Login with opencode/g, to: `Login with ${BRAND_CONFIG.new.appName}` },
      { from: /OpenCode Login/g, to: `${BRAND_CONFIG.new.productName} Login` },
      { from: /name:\s*"OpenCode"/g, to: `name: "${BRAND_CONFIG.new.productName}"` },
      // 🔴 Critical: 终端认证命令名
      { from: /command:\s*"opencode"/g, to: `command: "${BRAND_CONFIG.new.cliName}"` },
      // 🔴 修复: description 中的命令示例
      { from: /Run `opencode auth/g, to: `Run \`${BRAND_CONFIG.new.cliName} auth` },
      { from: /Run \`opencode auth/g, to: `Run \`${BRAND_CONFIG.new.cliName} auth` },
    ]);
    success(`${acpAgentFile} 已更新`);
  }

  // 9.12 Installation、IDE、Skill 模块
  info("处理 Installation、IDE、Skill 模块...");
  const coreModuleFiles = [
    "packages/opencode/src/installation/index.ts",
    "packages/opencode/src/ide/index.ts",
    "packages/opencode/src/skill/skill.ts",
  ];

  for (const file of coreModuleFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
        { from: /\bopencode\s+/g, to: `${BRAND_CONFIG.new.cliName} ` },

        // 🔴 Critical: 路径检查中的 .opencode
        { from: /\.opencode\//g, to: `.${BRAND_CONFIG.new.appName}/` },
        { from: /includes\(path\.join\("\.opencode",/g, to: `includes(path.join(".${BRAND_CONFIG.new.appName}",` },

        // IDE 扩展名 (sst-dev.opencode → sst-dev.costrict)
        { from: /"sst-dev\.opencode"/g, to: `"sst-dev.${BRAND_CONFIG.new.appName}"` },
      ]);
      success(`${file} 已更新`);
    }
  }

  // 9.13 Enterprise 和 Function
  info("处理 Enterprise 和 Function...");
  const backendFiles = [
    "packages/enterprise/src",
    "packages/function/src",
  ];

  for (const dir of backendFiles) {
    if (await fileExists(dir)) {
      const count = await replaceInDirectory(dir, "**/*.{ts,tsx}", [
        { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      ]);
      if (count > 0) {
        success(`${dir} - ${count} 个文件已更新`);
      }
    }
  }

  // 9.14 Session HTTP 头和 API 通信
  info("处理 Session HTTP 头和 API 通信...");
  const sessionLlmPath = "packages/opencode/src/session/llm.ts";
  if (await fileExists(sessionLlmPath)) {
    await replaceInFile(sessionLlmPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🔴 Critical: User-Agent 中的客户端标识 (仅替换值部分)
      { from: /`opencode\//g, to: `\`${BRAND_CONFIG.new.cliName}/` },

      // 🔴 Critical: originator 字段 (Codex API)
      { from: /originator:\s*"opencode"/g, to: `originator: "${BRAND_CONFIG.new.appName}"` },

      // 🟡 注意: HTTP 头名称 x-opencode-* 保持不变
      // 理由: 这些是后端 API 协议的一部分,修改需要后端同步更新
      // 如果后端需要识别新客户端,取消下面注释:
      // { from: /x-opencode-/g, to: "x-costrict-" },
    ]);
    success(`${sessionLlmPath} 已更新`);
  }

  // 9.15 Codex Plugin HTTP 头
  info("处理 Codex Plugin...");
  const codexPluginPath = "packages/opencode/src/plugin/codex.ts";
  if (await fileExists(codexPluginPath)) {
    await replaceInFile(codexPluginPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🔴 Critical: originator 字段
      { from: /originator:\s*"opencode"/g, to: `originator: "${BRAND_CONFIG.new.appName}"` },
    ]);
    success(`${codexPluginPath} 已更新`);
  }

  // 9.16 临时目录和内部路径
  info("处理临时目录和内部路径...");
  const internalPathFiles = [
    { file: "packages/opencode/src/lsp/server.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: 临时目录前缀 (JDTLS 数据目录)
      { from: /tmpdir\(\),\s*"opencode-/g, to: `tmpdir(), "${BRAND_CONFIG.new.appName}-` },
    ]},
    { file: "packages/opencode/src/project/project.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: Git 元数据路径 (.git/opencode → .git/costrict)
      { from: /path\.join\(git,\s*"opencode"\)/g, to: `path.join(git, "${BRAND_CONFIG.new.appName}")` },
    ]},
  ];

  for (const { file, replacements } of internalPathFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    }
  }

  // 9.17 Server HTTP 头
  info("处理 Server HTTP 头...");
  const serverServerPath = "packages/opencode/src/server/server.ts";
  if (await fileExists(serverServerPath)) {
    await replaceInFile(serverServerPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🟡 注意: x-opencode-directory 保持不变 (API 协议)
      // 如果需要修改,取消下面注释:
      // { from: /x-opencode-/g, to: "x-costrict-" },
    ]);
    success(`${serverServerPath} 已更新`);
  }

  // 9.18 CLI 入口点 - 脚本名称和环境变量
  info("处理 CLI 入口点...");
  const indexPath = "packages/opencode/src/index.ts";
  if (await fileExists(indexPath)) {
    await replaceInFile(indexPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🔴 Critical: CLI 脚本名称（显示在 --help）
      { from: /\.scriptName\("opencode"\)/g, to: `.scriptName("${BRAND_CONFIG.new.cliName}")` },

      // 🔴 Critical: 日志标识符
      { from: /Log\.Default\.info\("opencode",/g, to: `Log.Default.info("${BRAND_CONFIG.new.cliName}",` },

      // 🔴 Critical: 环境变量标记
      { from: /process\.env\.OPENCODE\s*=/g, to: `process.env.COSTRICT_RUNNING =` },
    ]);
    success(`${indexPath} 已更新`);
  }

  // 9.19 GitHub 自动化品牌
  info("处理 GitHub 自动化...");
  const githubPath = "packages/opencode/src/cli/cmd/github.ts";
  if (await fileExists(githubPath)) {
    await replaceInFile(githubPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🔴 Critical: GitHub Bot 用户名
      { from: /const AGENT_USERNAME = "opencode-agent\[bot\]"/g, to: `const AGENT_USERNAME = "${BRAND_CONFIG.new.appName}-agent[bot]"` },

      // 🔴 Critical: GitHub Workflow 文件路径
      { from: /const WORKFLOW_FILE = "\.github\/workflows\/opencode\.yml"/g, to: `const WORKFLOW_FILE = ".github/workflows/${BRAND_CONFIG.new.appName}.yml"` },

      // 🔴 Critical: GitHub App URL
      { from: /https:\/\/github\.com\/apps\/opencode-agent/g, to: `https://github.com/apps/${BRAND_CONFIG.new.appName}-agent` },

      // 🔴 Critical: Workflow 名称 (YAML 中的 name: opencode)
      { from: /name: opencode\n\s+on:/g, to: `name: ${BRAND_CONFIG.new.appName}\n      on:` },

      // 🔴 Critical: Git 分支前缀 (opencode/${type}-${hex})
      { from: /`opencode\/\$\{/g, to: `\`${BRAND_CONFIG.new.appName}/\${` },

      // 🔴 Critical: Social Card URL
      { from: /https:\/\/social-cards\.sst\.dev\/opencode-share\//g, to: `https://social-cards.sst.dev/${BRAND_CONFIG.new.appName}-share/` },

      // 🔴 Critical: Session 标识符 ([opencode session])
      { from: /\[opencode session\]/g, to: `[${BRAND_CONFIG.new.appName} session]` },
    ]);
    success(`${githubPath} 已更新`);
  }

  // 9.20 Git Worktree 分支前缀
  info("处理 Git Worktree 分支命名...");
  const worktreePath = "packages/opencode/src/worktree/index.ts";
  if (await fileExists(worktreePath)) {
    await replaceInFile(worktreePath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },

      // 🔴 Critical: Git 分支名称前缀 (opencode/${name})
      { from: /const branch = `opencode\/\$\{name\}`/g, to: `const branch = \`${BRAND_CONFIG.new.appName}/\${name}\`` },
    ]);
    success(`${worktreePath} 已更新`);
  }

  // 9.21 mDNS 服务名称
  info("处理 mDNS 服务名称...");
  const mdnsFiles = [
    { file: "packages/opencode/src/server/project.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: mDNS 服务名称 (opencode.local)
      { from: /\.local"\)/g, to: `.local")` }, // 保持 .local，只替换前面的 opencode
      { from: /"opencode\.local"/g, to: `"${BRAND_CONFIG.new.appName}.local"` },
    ]},
    { file: "packages/opencode/src/discovery/mdns.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      { from: /_opencode\._tcp/g, to: `_${BRAND_CONFIG.new.appName}._tcp` },
      { from: /name: "opencode"/g, to: `name: "${BRAND_CONFIG.new.appName}"` },
    ]},
    { file: "packages/opencode/src/cli/cmd/web.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: web 命令输出中的 mDNS 服务名显示
      { from: /"opencode\.local"/g, to: `"${BRAND_CONFIG.new.appName}.local"` },
    ]},
  ];

  for (const { file, replacements } of mdnsFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 9.22 Worker 内部 URL
  info("处理 Worker 内部 URL...");
  const workerFiles = [
    { file: "packages/ui/src/pierre/worker.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: Worker 内部调试 URL (opencode.internal)
      { from: /opencode\.internal/g, to: `${BRAND_CONFIG.new.appName}.internal` },
    ]},
    { file: "packages/opencode/src/cli/cmd/tui/thread.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      { from: /opencode\.internal/g, to: `${BRAND_CONFIG.new.appName}.internal` },
    ]},
    { file: "packages/opencode/src/cli/cmd/tui/worker.ts", replacements: [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: Worker baseUrl 配置
      { from: /opencode\.internal/g, to: `${BRAND_CONFIG.new.appName}.internal` },
    ]},
  ];

  for (const { file, replacements } of workerFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 9.23 OAuth Provider 应用名称
  info("增强 OAuth Provider 处理...");
  const oauthProviderPath = "packages/opencode/src/mcp/oauth-provider.ts";
  if (await fileExists(oauthProviderPath)) {
    await replaceInFile(oauthProviderPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: OAuth 应用名称
      { from: /application_name:\s*"opencode"/g, to: `application_name: "${BRAND_CONFIG.new.appName}"` },
    ]);
    success(`${oauthProviderPath} 已更新`);
  }

  // 9.24 Clipboard 临时文件名
  info("处理 Clipboard 临时文件...");
  const clipboardPath = "packages/opencode/src/tool/clipboard.ts";
  if (await fileExists(clipboardPath)) {
    await replaceInFile(clipboardPath, [
      { from: /OpenCode/g, to: BRAND_CONFIG.new.productName },
      // 🔴 Critical: 临时文件名前缀 (opencode-clipboard.png)
      { from: /opencode-clipboard/g, to: `${BRAND_CONFIG.new.appName}-clipboard` },
    ]);
    success(`${clipboardPath} 已更新`);
  }

  // 9.25 CLI 命令描述文本
  info("处理 CLI 命令描述文本...");
  const cliDescribeFiles = [
    "packages/opencode/src/cli/cmd/pr.ts",
    "packages/opencode/src/cli/cmd/run.ts",
    "packages/opencode/src/cli/cmd/serve.ts",
    "packages/opencode/src/cli/cmd/upgrade.ts",
    "packages/opencode/src/cli/cmd/web.ts",
  ];

  for (const file of cliDescribeFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        // 🔴 Critical: CLI 命令 describe 中的 opencode
        { from: /describe:\s*"([^"]*)\bopencode\b([^"]*)"/g, to: `describe: "$1${BRAND_CONFIG.new.cliName}$2"` },
      ]);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 9.26 Provider 请求头标识
  info("处理 Provider 请求头标识...");
  const providerPath = "packages/opencode/src/provider/provider.ts";
  if (await fileExists(providerPath)) {
    await replaceInFile(providerPath, [
      // 🔴 Critical: HTTP 请求头中的应用名标识
      { from: /"X-Title":\s*"opencode"/g, to: `"X-Title": "${BRAND_CONFIG.new.appName}"` },
      { from: /"x-title":\s*"opencode"/g, to: `"x-title": "${BRAND_CONFIG.new.appName}"` },
      { from: /"X-Cerebras-3rd-Party-Integration":\s*"opencode"/g, to: `"X-Cerebras-3rd-Party-Integration": "${BRAND_CONFIG.new.appName}"` },
    ]);
    success(`${providerPath} 已更新`);
  }

  // 9.27 MCP 客户端/服务器配置
  info("处理 MCP 客户端/服务器配置...");
  const mcpFiles = [
    "packages/opencode/src/mcp/index.ts",
    "packages/opencode/src/cli/cmd/mcp.ts",
  ];

  for (const file of mcpFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, [
        // 🔴 Critical: MCP 客户端/服务器名称标识
        { from: /name:\s*"opencode"(?=[,\s}])/g, to: `name: "${BRAND_CONFIG.new.appName}"` },
      ]);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 9.28 Server 应用标题
  info("处理 Server 应用标题...");
  const serverPath = "packages/opencode/src/server/server.ts";
  if (await fileExists(serverPath)) {
    await replaceInFile(serverPath, [
      // 🔴 Critical: Server 响应中的应用标题
      { from: /title:\s*"opencode"(?=[,\s}])/g, to: `title: "${BRAND_CONFIG.new.appName}"` },
    ]);
    success(`${serverPath} 已更新`);
  }

  // 9.29 TUI 组件和对话框文本
  info("处理 TUI 组件和对话框...");
  const tuiDialogFiles = [
    { file: "packages/opencode/src/cli/cmd/tui/component/dialog-status.tsx", replacements: [
      // 🔴 Critical: 认证提示中的命令名
      { from: /run: opencode mcp auth/g, to: `run: ${BRAND_CONFIG.new.cliName} mcp auth` },
    ]},
    { file: "packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx", replacements: [
      // 🔴 Critical: 权限对话框中的产品名
      { from: /until OpenCode is restarted/g, to: `until ${BRAND_CONFIG.new.productName} is restarted` },
      { from: /Tell OpenCode what to do/g, to: `Tell ${BRAND_CONFIG.new.productName} what to do` },
    ]},
    { file: "packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx", replacements: [
      // 🔴 Critical: 侧边栏提示文本
      { from: /OpenCode includes free models/g, to: `${BRAND_CONFIG.new.productName} includes free models` },
    ]},
  ];

  for (const { file, replacements } of tuiDialogFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 9.30 UI 主题和 Shiki 高亮器
  info("处理 UI 主题和语法高亮...");
  const uiThemeFiles = [
    { file: "packages/ui/src/context/marked.tsx", replacements: [
      // 🔴 Critical: Shiki 高亮器主题注册和名称
      { from: /registerCustomTheme\("OpenCode"/g, to: `registerCustomTheme("${BRAND_CONFIG.new.productName}"` },
      { from: /name:\s*"OpenCode"/g, to: `name: "${BRAND_CONFIG.new.productName}"` },
      { from: /themes:\s*\["OpenCode"\]/g, to: `themes: ["${BRAND_CONFIG.new.productName}"]` },
    ]},
    { file: "packages/ui/src/components/favicon.tsx", replacements: [
      // 🔴 Critical: Apple Web App 标题
      { from: /<Meta name="apple-mobile-web-app-title" content="OpenCode" \/>/g, to: `<Meta name="apple-mobile-web-app-title" content="${BRAND_CONFIG.new.productName}" />` },
    ]},
    { file: "packages/ui/src/theme/desktop-theme.schema.json", replacements: [
      // 🟡 Medium: Schema 标题和描述
      { from: /"title":\s*"OpenCode Desktop Theme"/g, to: `"title": "${BRAND_CONFIG.new.productName} Desktop Theme"` },
      { from: /"description":\s*"A theme definition for the OpenCode desktop application"/g, to: `"description": "A theme definition for the ${BRAND_CONFIG.new.productName} desktop application"` },
    ]},
  ];

  for (const { file, replacements } of uiThemeFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 9.31 PWA Manifest
  info("处理 PWA Manifest...");
  const manifestPath = "packages/ui/src/assets/favicon/site.webmanifest";
  if (await fileExists(manifestPath)) {
    info(`更新 ${manifestPath}...`);
    await replaceInFile(manifestPath, [
      // 🔴 Critical: PWA 应用名称
      { from: /"name":\s*"OpenCode"/g, to: `"name": "${BRAND_CONFIG.new.productName}"` },
      { from: /"short_name":\s*"OpenCode"/g, to: `"short_name": "${BRAND_CONFIG.new.productName}"` },
    ]);
    success(`${manifestPath} 已更新`);
  } else {
    info(`跳过: ${manifestPath} (文件不存在)`);
  }

  success("Phase 9 完成");
}

// ========================================
// Phase 10: Tauri 配置（来自 manual-checklist.md Phase 3）
// ========================================
async function phase10TauriConfig() {
  phase("Phase 10: 更新 Tauri 配置...");

  // 10.1 tauri.conf.json
  const tauriConfigPath = "packages/desktop/src-tauri/tauri.conf.json";
  if (await fileExists(tauriConfigPath)) {
    info(`修改 ${tauriConfigPath}...`);
    await replaceInFile(tauriConfigPath, [
      { from: /"productName":\s*"OpenCode\s+(\w+)"/g, to: `"productName": "${BRAND_CONFIG.new.productName} $1"` },
      { from: /"identifier":\s*"ai\.opencode\./g, to: `"identifier": "ai.costrict.` },
      { from: /"mainBinaryName":\s*"OpenCode"/g, to: `"mainBinaryName": "${BRAND_CONFIG.new.productName}"` },
      { from: /"sidecars\/opencode-cli"/g, to: `"sidecars/${BRAND_CONFIG.new.cliName}-cli"` },
    ]);
    success(`${tauriConfigPath} 已更新`);
  } else {
    info(`跳过: ${tauriConfigPath} (文件不存在)`);
  }

  // 10.2 tauri.prod.conf.json (如果存在)
  const tauriProdConfigPath = "packages/desktop/src-tauri/tauri.prod.conf.json";
  if (await fileExists(tauriProdConfigPath)) {
    info(`修改 ${tauriProdConfigPath}...`);
    await replaceInFile(tauriProdConfigPath, [
      // 🔴 Critical: productName - 先匹配带空格和单词的，再匹配单独的
      { from: /"productName":\s*"OpenCode\s+(\w+)"/g, to: `"productName": "${BRAND_CONFIG.new.productName} $1"` },
      { from: /"productName":\s*"OpenCode"/g, to: `"productName": "${BRAND_CONFIG.new.productName}"` },
      { from: /"identifier":\s*"ai\.opencode\./g, to: `"identifier": "ai.costrict.` },
      { from: /"mainBinaryName":\s*"OpenCode"/g, to: `"mainBinaryName": "${BRAND_CONFIG.new.productName}"` },
      { from: /"sidecars\/opencode-cli"/g, to: `"sidecars/${BRAND_CONFIG.new.cliName}-cli"` },
    ]);
    success(`${tauriProdConfigPath} 已更新`);
  }

  success("Phase 10 完成");
}

// ========================================
// Phase 11: Cargo 配置（来自 manual-checklist.md Phase 3）
// ========================================
async function phase11CargoConfig() {
  phase("Phase 11: 更新 Cargo 配置...");

  const cargoTomlPath = "packages/desktop/src-tauri/Cargo.toml";
  if (await fileExists(cargoTomlPath)) {
    info(`修改 ${cargoTomlPath}...`);
    await replaceInFile(cargoTomlPath, [
      { from: /^name\s*=\s*"opencode-desktop"/gm, to: `name = "costrict-desktop"` },
      { from: /^name\s*=\s*"opencode_lib"/gm, to: `name = "costrict_lib"` },
    ]);
    success(`${cargoTomlPath} 已更新`);
  } else {
    info(`跳过: ${cargoTomlPath} (文件不存在)`);
  }

  success("Phase 11 完成");
}

// ========================================
// Phase 12: Zed 扩展配置（来自 manual-checklist.md Phase 4）
// ========================================
async function phase12ZedExtension() {
  phase("Phase 12: 更新 Zed 扩展配置...");

  const zedExtensionPath = "packages/extensions/zed/extension.toml";
  if (await fileExists(zedExtensionPath)) {
    info(`修改 ${zedExtensionPath}...`);
    await replaceInFile(zedExtensionPath, [
      { from: /^id\s*=\s*"opencode"/gm, to: `id = "costrict"` },
      { from: /^name\s*=\s*"OpenCode"/gm, to: `name = "${BRAND_CONFIG.new.productName}"` },
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },
      { from: /opencode-\{platform\}/g, to: `${BRAND_CONFIG.new.cliName}-{platform}` },
      { from: /\[agent_servers\.opencode\]/g, to: `[agent_servers.${BRAND_CONFIG.new.appName}]` },
    ]);
    success(`${zedExtensionPath} 已更新`);
  } else {
    info(`跳过: ${zedExtensionPath} (文件不存在)`);
  }

  success("Phase 12 完成");
}

// ========================================
// Phase 13: Install 脚本更新
// ========================================
async function phase13InstallScript() {
  phase("Phase 13: 更新 Install 脚本...");

  const installPath = "install";
  if (await fileExists(installPath)) {
    info(`修改 ${installPath}...`);
    await replaceInFile(installPath, [
      // === 1. 用户可见文本 ===
      { from: /OpenCode Installer/g, to: `${BRAND_CONFIG.new.productName} Installer` },
      { from: /OpenCode includes free models/g, to: `${BRAND_CONFIG.new.productName} includes free models` },

      // === 2. 域名和URL ===
      { from: /https:\/\/opencode\.ai/g, to: `https://${BRAND_CONFIG.new.domain}` },
      { from: /opencode\.ai/g, to: BRAND_CONFIG.new.domain },

      // === 3. 仓库引用 ===
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },

      // === 4. 安装目录 ===
      { from: /\.opencode\/bin/g, to: `.${BRAND_CONFIG.new.appName}/bin` },
      { from: /\$HOME\/\.opencode/g, to: `$HOME/.${BRAND_CONFIG.new.appName}` },

      // === 5. 二进制文件名和变量 ===
      // APP 变量(用于下载的文件名)
      { from: /^APP=opencode$/m, to: `APP=${BRAND_CONFIG.new.cliName}` },

      // 临时目录和文件名
      { from: /opencode_install/g, to: `${BRAND_CONFIG.new.appName}_install` },

      // 移动/复制命令中的二进制文件引用
      { from: /"\$tmp_dir\/opencode"/g, to: `"$tmp_dir/${BRAND_CONFIG.new.cliName}"` },
      { from: /"\$\{INSTALL_DIR\}\/opencode"/g, to: `"\${INSTALL_DIR}/${BRAND_CONFIG.new.cliName}"` },

      // === 6. 命令提示和示例 ===
      // 命令提示行 (注意保持格式对齐)
      { from: /echo -e "opencode\s+\$\{MUTED\}/g, to: `echo -e "${BRAND_CONFIG.new.cliName}      \${MUTED}` },
      // 🔴 修复: --binary 参数示例
      { from: /--binary \/path\/to\/opencode(?!\-)/g, to: `--binary /path/to/${BRAND_CONFIG.new.cliName}` },

      // === 7. 命令检查 ===
      { from: /command -v opencode/g, to: `command -v ${BRAND_CONFIG.new.cliName}` },
      { from: /which opencode/g, to: `which ${BRAND_CONFIG.new.cliName}` },
      { from: /opencode --version/g, to: `${BRAND_CONFIG.new.cliName} --version` },

      // === 8. Shell 配置注释 ===
      { from: /# opencode$/m, to: `# ${BRAND_CONFIG.new.appName}` },
    ]);
    success(`${installPath} 已更新`);
  }

  success("Phase 13 完成");
}

// ========================================
// Phase 14: AI 助手提示词（角色定义）
// ========================================
async function phase14AIPrompts() {
  phase("Phase 14: 更新 AI 助手提示词...");

  // 14.1 批量更新所有提示词文件
  info("更新 AI 助手提示词文件...");
  const promptCount = await replaceInDirectory(
    "packages/opencode/src/session/prompt",
    "**/*.txt",
    [
      // 角色定义（大写和小写）
      { from: /You are OpenCode/g, to: "You are CoStrict" },
      { from: /You are opencode/g, to: "You are costrict" },
      { from: /you are OpenCode/g, to: "you are CoStrict" },
      { from: /you are opencode/g, to: "you are costrict" },

      // 产品名提及（作为主语、宾语等）
      { from: /\bOpenCode\b/g, to: "CoStrict" },

      // GitHub 仓库
      { from: /https:\/\/github\.com\/anomalyco\/opencode/g, to: `https://github.com/${BRAND_CONFIG.new.repo}` },
      { from: /github\.com\/anomalyco\/opencode/g, to: `github.com/${BRAND_CONFIG.new.repo}` },
      { from: /anomalyco\/opencode/g, to: BRAND_CONFIG.new.repo },

      // 文档域名和其他 URL
      { from: /https:\/\/opencode\.ai/g, to: `https://${BRAND_CONFIG.new.domain}` },
      { from: /opencode\.ai/g, to: BRAND_CONFIG.new.domain },
    ]
  );

  if (promptCount > 0) {
    success(`已更新 ${promptCount} 个提示词文件`);
  }

  success("Phase 14 完成");
}

// ========================================
// Phase 15: ASCII Logo 替换
// ========================================
async function phase15AsciiLogo() {
  phase("Phase 15: 替换 ASCII Logo...");

  // 15.1 CLI ui.ts Logo
  const uiFilePath = "packages/opencode/src/cli/ui.ts";
  if (await fileExists(uiFilePath)) {
    info(`读取 ${uiFilePath}...`);
    let content = await fs.readFile(uiFilePath, "utf-8");

    // 构造新 Logo 的字符串（保持双列格式）
    const newLogoLines = BRAND_CONFIG.new.asciiLogo.map(row => {
      return `    [\`${row[0]}\`, \`${row[1]}\`],`;
    }).join('\n');
    const newLogoStr = `const LOGO = [\n${newLogoLines}\n  ]`;

    // 使用正则匹配旧 Logo（双列格式）
    const oldLogoPattern = /const LOGO = \[\s*\[`[^`]*`, `[^`]*`\],\s*\[`[^`]*`, `[^`]*`\],\s*\[`[^`]*`, `[^`]*`\],\s*\[`[^`]*`, `[^`]*`\],\s*\]/;

    if (oldLogoPattern.test(content)) {
      content = content.replace(oldLogoPattern, newLogoStr);

      if (!isDryRun) {
        await fs.writeFile(uiFilePath, content, "utf-8");
        success(`${uiFilePath} Logo 已更新`);
      } else {
        info(`[DRY-RUN] 将替换 ${uiFilePath} 中的 Logo`);
      }
    } else {
      warning(`未找到匹配的旧 Logo 格式: ${uiFilePath}`);
    }
  } else {
    warning(`未找到 ${uiFilePath}`);
  }

  // 15.2 TUI Logo 组件
  const logoComponentPath = "packages/opencode/src/cli/cmd/tui/component/logo.tsx";
  if (await fileExists(logoComponentPath)) {
    info(`读取 ${logoComponentPath}...`);
    let content = await fs.readFile(logoComponentPath, "utf-8");

    // 构造新的 LOGO_LEFT 和 LOGO_RIGHT
    const logoLeftLines = BRAND_CONFIG.new.asciiLogo.map(row => `\`${row[0]}\``).join(', ');
    const logoRightLines = BRAND_CONFIG.new.asciiLogo.map(row => `\`${row[1]}\``).join(', ');

    const newLogoLeft = `const LOGO_LEFT = [${logoLeftLines}]`;
    const newLogoRight = `const LOGO_RIGHT = [${logoRightLines}]`;

    // 使用正则匹配旧的 LOGO_LEFT 和 LOGO_RIGHT
    const oldLogoLeftPattern = /const LOGO_LEFT = \[[^\]]+\]/;
    const oldLogoRightPattern = /const LOGO_RIGHT = \[[^\]]+\]/;

    if (oldLogoLeftPattern.test(content) && oldLogoRightPattern.test(content)) {
      content = content.replace(oldLogoLeftPattern, newLogoLeft);
      content = content.replace(oldLogoRightPattern, newLogoRight);

      if (!isDryRun) {
        await fs.writeFile(logoComponentPath, content, "utf-8");
        success(`${logoComponentPath} Logo 已更新`);
      } else {
        info(`[DRY-RUN] 将替换 ${logoComponentPath} 中的 Logo`);
      }
    } else {
      warning(`未找到匹配的旧 Logo 格式: ${logoComponentPath}`);
    }
  } else {
    warning(`未找到 ${logoComponentPath}`);
  }

  success("Phase 15 完成");
}

// ========================================
// Phase 16: Console App 和 Enterprise 用户界面
// ========================================
async function phase16ConsoleApp() {
  phase("Phase 16: 更新 Console App 和 Enterprise...");

  // 16.1 Console App 核心组件
  const consoleAppFiles = [
    { file: "packages/console/app/src/app.tsx", replacements: [
      // 🔴 Critical: 页面标题和元描述
      { from: /<Title>opencode<\/Title>/g, to: `<Title>${BRAND_CONFIG.new.appName}</Title>` },
      { from: /"OpenCode - The open source coding agent\."/g, to: `"${BRAND_CONFIG.new.productName} - The open source coding agent."` },
    ]},
    { file: "packages/console/app/src/routes/[...404].tsx", replacements: [
      // 🔴 Critical: 404 页面标题
      { from: /<Title>Not Found \| opencode<\/Title>/g, to: `<Title>Not Found | ${BRAND_CONFIG.new.appName}</Title>` },
    ]},
    { file: "packages/console/app/src/routes/temp.tsx", replacements: [
      // 🔴 Critical: 临时页面中的产品名和安装命令
      { from: /provided by opencode/g, to: `provided by ${BRAND_CONFIG.new.appName}` },
      { from: /paru -S <strong>opencode-bin<\/strong>/g, to: `paru -S <strong>${BRAND_CONFIG.new.cliName}-bin</strong>` },
    ]},
    { file: "packages/console/app/src/routes/black/index.tsx", replacements: [
      // 🔴 Critical: Black Friday 页面标题
      { from: /<Title>opencode<\/Title>/g, to: `<Title>${BRAND_CONFIG.new.appName}</Title>` },
    ]},
    { file: "packages/console/app/src/routes/black/workspace.tsx", replacements: [
      // 🔴 Critical: Workspace 页面标题
      { from: /<Title>opencode<\/Title>/g, to: `<Title>${BRAND_CONFIG.new.appName}</Title>` },
    ]},
  ];

  for (const { file, replacements } of consoleAppFiles) {
    if (await fileExists(file)) {
      await replaceInFile(file, replacements);
      success(`${file} 已更新`);
    } else {
      info(`跳过: ${file} (文件不存在)`);
    }
  }

  // 16.2 Console 下载页面
  const downloadPagePath = "packages/console/app/src/routes/download/index.tsx";
  if (await fileExists(downloadPagePath)) {
    info(`更新 ${downloadPagePath}...`);
    await replaceInFile(downloadPagePath, [
      // 🔴 Critical: npm 安装命令
      { from: /npm i -g <strong>opencode-ai<\/strong>/g, to: `npm i -g <strong>${BRAND_CONFIG.new.npmPackageName}</strong>` },
      { from: /handleCopyClick\("npm i -g opencode-ai"\)/g, to: `handleCopyClick("npm i -g ${BRAND_CONFIG.new.npmPackageName}")` },

      // 🔴 Critical: bun 安装命令
      { from: /bun add -g <strong>opencode-ai<\/strong>/g, to: `bun add -g <strong>${BRAND_CONFIG.new.npmPackageName}</strong>` },
      { from: /handleCopyClick\("bun add -g opencode-ai"\)/g, to: `handleCopyClick("bun add -g ${BRAND_CONFIG.new.npmPackageName}")` },

      // 🔴 Critical: AUR 包名
      { from: /paru -S <strong>opencode<\/strong>/g, to: `paru -S <strong>${BRAND_CONFIG.new.cliName}</strong>` },
      { from: /handleCopyClick\("paru -S opencode"\)/g, to: `handleCopyClick("paru -S ${BRAND_CONFIG.new.cliName}")` },
    ]);
    success(`${downloadPagePath} 已更新`);
  } else {
    info(`跳过: ${downloadPagePath} (文件不存在)`);
  }

  // 16.3 Console 法律文档
  const termsOfServicePath = "packages/console/app/src/routes/legal/terms-of-service/index.tsx";
  if (await fileExists(termsOfServicePath)) {
    info(`更新 ${termsOfServicePath}...`);
    await replaceInFile(termsOfServicePath, [
      // 🔴 Critical: 法律文档中的品牌名（全部替换）
      { from: /\bOpenCode\b/g, to: BRAND_CONFIG.new.productName },
      { from: /\bOPENCODE\b/g, to: BRAND_CONFIG.new.productName.toUpperCase() },

      // 🔴 Critical: HTML 标签中的 ID 属性 (精确匹配标签格式)
      { from: /id="what-is-opencode"/g, to: `id="what-is-${BRAND_CONFIG.new.appName}"` },
      { from: /id="will-opencode-ever-change-the-services"/g, to: `id="will-${BRAND_CONFIG.new.appName}-ever-change-the-services"` },

      // 🔴 Critical: 锚点引用 (用于链接跳转)
      { from: /#what-is-opencode/g, to: `#what-is-${BRAND_CONFIG.new.appName}` },
      { from: /#will-opencode-ever-change/g, to: `#will-${BRAND_CONFIG.new.appName}-ever-change` },
    ]);
    success(`${termsOfServicePath} 已更新`);
  } else {
    info(`跳过: ${termsOfServicePath} (文件不存在)`);
  }

  // 16.4 Console 主页 (Landing Page)
  const indexPagePath = "packages/console/app/src/routes/index.tsx";
  if (await fileExists(indexPagePath)) {
    info(`更新 ${indexPagePath}...`);
    await replaceInFile(indexPagePath, [
      // 🔴 Critical: 视频资源引用 (仅路径，不修改文件名)
      // 注意: opencode-min.mp4 文件名保持不变，因为替换需要同步更新资产文件

      // 🔴 Critical: 页面数据属性
      { from: /data-page="opencode"/g, to: `data-page="${BRAND_CONFIG.new.appName}"` },

      // 🔴 Critical: 安装命令中的包名
      { from: /<span data-slot="highlight">opencode-ai<\/span>/g, to: `<span data-slot="highlight">${BRAND_CONFIG.new.npmPackageName}</span>` },
      { from: /<span data-slot="highlight">opencode<\/span>/g, to: `<span data-slot="highlight">${BRAND_CONFIG.new.cliName}</span>` },
    ]);
    success(`${indexPagePath} 已更新`);
  } else {
    info(`跳过: ${indexPagePath} (文件不存在)`);
  }

  // 16.5 Console Zen 页面
  const zenPagePath = "packages/console/app/src/routes/zen/index.tsx";
  if (await fileExists(zenPagePath)) {
    info(`更新 ${zenPagePath}...`);
    await replaceInFile(zenPagePath, [
      // 🟡 Medium: 视频资源引用 (仅路径，不修改文件名)
      // opencode-comparison-min.mp4 保持不变
    ]);
    success(`${zenPagePath} 已更新`);
  } else {
    info(`跳过: ${zenPagePath} (文件不存在)`);
  }

  // 16.6 Enterprise 分享页面
  const enterpriseSharePath = "packages/enterprise/src/routes/share/[shareID].tsx";
  if (await fileExists(enterpriseSharePath)) {
    info(`更新 ${enterpriseSharePath}...`);
    await replaceInFile(enterpriseSharePath, [
      // 🔴 Critical: Meta 描述
      { from: /opencode - The AI coding agent built for the terminal\./g, to: `${BRAND_CONFIG.new.cliName} - The AI coding agent built for the terminal.` },
    ]);
    success(`${enterpriseSharePath} 已更新`);
  } else {
    info(`跳过: ${enterpriseSharePath} (文件不存在)`);
  }

  // 16.7 App 布局组件
  const appLayoutPath = "packages/app/src/pages/layout.tsx";
  if (await fileExists(appLayoutPath)) {
    info(`更新 ${appLayoutPath}...`);
    // 🟡 Medium: props.project.id === opencode 检查
    // 这里的 `opencode` 应该是一个变量引用，需要确认上下文
    // 暂时保留，等待进一步审查
    success(`${appLayoutPath} 已审查 (需人工确认 props.project.id 引用)`);
  } else {
    info(`跳过: ${appLayoutPath} (文件不存在)`);
  }

  // 16.8 App 公共资源 (localStorage 键名)
  const themePreloadPath = "packages/app/public/oc-theme-preload.js";
  if (await fileExists(themePreloadPath)) {
    info(`更新 ${themePreloadPath}...`);
    await replaceInFile(themePreloadPath, [
      // 🔴 Critical: localStorage 键名
      { from: /"opencode-theme-id"/g, to: `"${BRAND_CONFIG.new.appName}-theme-id"` },
      { from: /"opencode-color-scheme"/g, to: `"${BRAND_CONFIG.new.appName}-color-scheme"` },
      { from: /"opencode-theme-css-"/g, to: `"${BRAND_CONFIG.new.appName}-theme-css-"` },
    ]);
    success(`${themePreloadPath} 已更新`);
  } else {
    info(`跳过: ${themePreloadPath} (文件不存在)`);
  }

  info("");
  warning("📦 品牌资产文件提醒:");
  info("  packages/console/app/src/routes/brand/index.tsx 中引用的品牌资产文件");
  info("  (opencode-logo-*, opencode-wordmark-*) 需要单独重新设计。");
  info("  参见 script/costrict/README.md 中的 TODO 部分。");
  info("");

  success("Phase 16 完成");
}

// ========================================
// 主函数
// ========================================
async function main() {
  header("CoStrict 品牌自动应用脚本");

  // 备份当前 commit（用于失败时回滚）
  let beforeCommit = "";
  if (!isDryRun) {
    try {
      beforeCommit = (await $`git rev-parse HEAD`.text()).trim();
      info(`当前 commit: ${beforeCommit.slice(0, 7)}`);
    } catch (e) {
      warning("无法获取当前 commit，跳过自动回滚");
    }
  }

  if (isDryRun) {
    warning("DRY-RUN 模式：将显示修改但不实际执行");
    console.log("");
  }

  log("配置信息:", "cyan");
  log(`  应用名: ${BRAND_CONFIG.new.appName}`, "reset");
  log(`  产品名: ${BRAND_CONFIG.new.productName}`, "reset");
  log(`  CLI 命令: ${BRAND_CONFIG.new.cliName}`, "reset");
  log(`  仓库: ${BRAND_CONFIG.new.repo}`, "reset");
  log("", "reset");

  const startTime = Date.now();

  try {
    await phase0PackageJsonRepo();
    await phase1CoreConfig();
    await phase2EnvVars();
    await phase3RustFiles();
    await phase4Domains();
    await phase5Docs();
    await phase6Workflows();
    await phase7BuildScripts();
    await phase8Configs();
    await phase9UserFacingStrings();
    await phase10TauriConfig();
    await phase11CargoConfig();
    await phase12ZedExtension();
    await phase13InstallScript();
    await phase14AIPrompts();
    await phase15AsciiLogo();
    await phase16ConsoleApp();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    header("品牌应用完成！");
    success(`总耗时: ${elapsed}s`);

    if (isDryRun) {
      log("", "reset");
      warning("这是 DRY-RUN 模式的输出，未实际修改文件");
      log("", "reset");
      info("如需实际执行，运行:");
      info("  bun run script/costrict/rebrand-apply.ts");
    } else {
      log("", "reset");
      log("下一步:", "cyan");
      log("  1. 运行验证脚本: bun run script/costrict/verify-brand.ts", "reset");
      log("  2. 运行类型检查: bun run typecheck", "reset");
      log("  3. 提交修改: git add . && git commit -m 'chore: reapply branding'", "reset");
    }
    log("", "reset");
  } catch (error) {
    console.error("");
    log("❌ 品牌应用失败:", "red");
    console.error(error);

    // 自动回滚到执行前状态
    if (beforeCommit && !isDryRun) {
      console.log("");
      warning("正在回滚到执行前状态...");
      try {
        await $`git reset --hard ${beforeCommit}`;
        success(`已回滚到 ${beforeCommit.slice(0, 7)}`);
        info("工作目录已恢复到品牌应用前的状态");
      } catch (rollbackError) {
        log("  ✗ 自动回滚失败，请手动执行:", "red");
        info(`  git reset --hard ${beforeCommit}`);
      }
    }

    process.exit(1);
  }
}

// 运行
main();
