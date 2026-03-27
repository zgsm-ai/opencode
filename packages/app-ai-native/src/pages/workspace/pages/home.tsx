import { Marked } from "marked"
import markedShiki from "marked-shiki"
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki"
import { createMemo, createSignal, onMount } from "solid-js"
import { useLanguage } from "@/context/language"

const zh = `
---

CoStrict Cloud 是一个 AI 驱动的云端编程工作空间，让你随时随地通过浏览器远程连接个人设备，进行对话式编程与项目管理。

## 快速开始

### 0. 登录账号

使用 CoStrict Cloud 前，请先确保已登录平台账号。如果尚未登录，请点击左侧边栏底部的 **登录按钮** 完成登录。

> **注意：** 你需要在 CoStrict CLI 端登录 **相同的账号**，以确保设备能够正确关联到你的工作空间。

### 1. 注册设备

在你的个人设备上安装并使用 [CoStrict CLI](https://docs.costrict.ai/cli/guide/installation) 工具。登录 CoStrict 供应商账号后，执行以下命令完成设备注册：

\`\`\`bash
cs cloud start
\`\`\`

注册成功后，你的设备将自动出现在左侧边栏的 **设备列表** 中。

### 2. 创建工作空间

在设备列表中找到已注册的设备，点击设备卡片右侧的 **"+"** 按钮，选择目标工作目录即可创建工作空间。每个工作空间对应设备上的一个项目目录。

### 3. 连接工作空间

当工作空间处于空闲状态时，点击工作空间卡片右侧的 **连接图标** 即可建立连接。连接成功后，你可以：

- **远程对话** — 与 AI 助手实时交流，提问、生成代码、调试问题
- **会话管理** — 创建、切换和回顾多个会话，保留完整的对话历史
- **项目协作** — 在浏览器中直接操作远程设备上的代码

---

## 了解更多

- 前往 **商店** 发现技能、子代理和 MCP 服务器，扩展你的编程能力。
- 访问 [costrict.ai](https://costrict.ai) 获取完整文档与最新动态。
`

const en = `
---

CoStrict Cloud is an AI-powered cloud workspace that lets you remotely connect to your personal devices from any browser for conversational coding and project management.

## Getting Started

### 0. Sign In

Before using CoStrict Cloud, make sure you are signed in. If not, click the **Sign In** button at the bottom of the left sidebar to log in.

> **Note:** You must sign in with the **same account** on the CoStrict CLI to ensure your device is correctly linked to your workspace.

### 1. Register a Device

Install the [CoStrict CLI](https://docs.costrict.ai/cli/guide/installation) on your personal device. After logging into your CoStrict provider account, run the following command to register the device:

\`\`\`bash
cs cloud start
\`\`\`

Once registered, your device will automatically appear in the **device list** in the left sidebar.

### 2. Create a Workspace

Locate your registered device in the device list and click the **"+"** button on the right side of the device card. Select a project directory to create a workspace. Each workspace maps to a directory on your device.

### 3. Connect to a Workspace

When a workspace is idle, click the **connect icon** on the right side of the workspace card to establish a connection. Once connected, you can:

- **Remote Chat** — Interact with the AI assistant in real time to ask questions, generate code, and debug issues
- **Session Management** — Create, switch between, and review multiple sessions with full conversation history
- **Project Collaboration** — Operate on remote device code directly from your browser

---

## Learn More

- Visit the **Store** to discover skills, subagents, and MCP servers that extend your coding capabilities.
- Go to [costrict.ai](https://costrict.ai) for full documentation and updates.
`

let instance: Marked | undefined
const cache = new Map<string, string>()

async function getParser() {
  if (instance) return instance
  const highlighter = await createHighlighter({ themes: ["github-dark"], langs: ["bash", "text"] })
  instance = new Marked().use(
    {
      renderer: {
        link({ href, title, text }) {
          const attr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${attr} target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    markedShiki({
      async highlight(code, lang) {
        if (!(lang in bundledLanguages)) lang = "text"
        if (!highlighter.getLoadedLanguages().includes(lang))
          await highlighter.loadLanguage(lang as BundledLanguage)
        return highlighter.codeToHtml(code, { lang: lang || "text", theme: "github-dark", tabindex: false })
      },
    }),
  )
  return instance
}

async function render(md: string) {
  const cached = cache.get(md)
  if (cached) return cached
  const parser = await getParser()
  const result = await parser.parse(md)
  cache.set(md, result)
  return result
}

export default function WorkspaceHome() {
  const language = useLanguage()
  const loc = () => language.locale()
  const title = () => (loc() === "zh" || loc() === "zht" ? "欢迎使用 CoStrict Cloud" : "Welcome to CoStrict Cloud")
  const md = createMemo(() => (loc() === "zh" || loc() === "zht" ? zh : en))
  const [html, setHtml] = createSignal("")

  const update = () => render(md()).then(setHtml)
  onMount(update)

  let prev = md()
  createMemo(() => {
    const next = md()
    if (next !== prev) {
      prev = next
      update()
    }
  })

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-2xl mx-auto py-12 px-6">
        <h1 class="font-bold text-text-strong mb-4" style={{ "font-size": "2.5rem", "line-height": "1.2" }}>{title()}</h1>
        <div data-component="markdown" innerHTML={html()} />
      </div>
    </div>
  )
}
