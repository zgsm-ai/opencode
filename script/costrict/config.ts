/**
 * CoStrict 品牌配置 - 核心共用部分
 *
 * 所有品牌相关的常量统一在此管理
 */

export const BRAND_CONFIG = {
  // 新品牌
  new: {
    appName: "costrict",
    productName: "CoStrict",
    cliName: "costrict-cli",        // CLI 命令名 (用户执行的命令)
    npmPackageName: "costrict-ai",    // npm 发布包名 (用户安装: npm i -g costrict-ai)
    repo: "zgsm-ai/costrict-cli",
    domain: "costrict.ai",
    apiDomain: "zgsm.sangfor.com",
    userDataDir: ".costrict",         // 用户数据目录 (如: ~/.costrict)
    configFileName: "costrict",       // 配置文件基础名 (如: costrict.json, costrict.jsonc)
    envPrefix: "COSTRICT_",          // 环境变量前缀 (如: COSTRICT_API_KEY)
    // ASCII Logo (用于 CLI 显示，双列格式: CO | STRICT)
    asciiLogo: [
      [` ██████╗ ██████╗ `, `███████╗████████╗██████╗ ██╗ ██████╗████████╗`],
      [`██╔════╝██╔═══██╗`, `██╔════╝╚══██╔══╝██╔══██╗██║██╔════╝╚══██╔══╝`],
      [`██║     ██║   ██║`, `███████╗   ██║   ██████╔╝██║██║        ██║   `],
      [`██║     ██║   ██║`, `╚════██║   ██║   ██╔══██╗██║██║        ██║   `],
      [`╚██████╗╚██████╔╝`, `███████║   ██║   ██║  ██║██║╚██████╗   ██║   `],
      [` ╚═════╝ ╚═════╝ `, `╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝ ╚═════╝   ╚═╝   `],
    ],
  },

  // 旧品牌（用于查找替换）
  old: {
    appName: "opencode",
    productName: "OpenCode",
    cliName: "opencode",
    npmPackageName: "opencode-ai",
    repo: "anomalyco/opencode",
    domain: "opencode.ai",
    userDataDir: ".opencode",
    configFileName: "opencode",
    envPrefix: "OPENCODE_",
    // OpenCode 原始 ASCII Logo
    asciiLogo: [
      [`                    `, `             ▄     `],
      [`█▀▀█ █▀▀█ █▀▀█ █▀▀▄ `, `█▀▀▀ █▀▀█ █▀▀█ █▀▀█`],
      [`█░░█ █░░█ █▀▀▀ █░░█ `, `█░░░ █░░█ █░░█ █▀▀▀`],
      [`▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀ `, `▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀`],
    ],
  },
} as const;
