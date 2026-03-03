import { createEffect, createMemo, createResource, createSignal, onMount } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useRoute } from "@tui/context/route"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "@tui/ui/toast"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useTheme } from "@tui/context/theme"
import { Identifier } from "@/id/id"
import { TextAttributes } from "@opentui/core"
import { DialogCodingProposal } from "@tui/component/dialog-coding-proposal"
import { DialogFixProposal } from "@tui/component/dialog-fix-proposal"
import fs from "fs"
import path from "path"
import { scanProposals } from "@tui/util/proposal"

function DialogTaskcheckStarting(props: { changeId?: string }) {
  const theme = useTheme()
  useKeyboard((evt) => {
    if (evt.name !== "escape" && evt.name !== "tab") return
    evt.preventDefault()
    evt.stopPropagation()
  })
  return (
    <box paddingLeft={4} paddingRight={4} gap={1} paddingBottom={1}>
      <text fg={theme.theme.text} attributes={TextAttributes.BOLD}>
        TaskCheck agent 启动中
      </text>
      <text fg={theme.theme.textMuted}>change-id: {props.changeId ?? "-"}</text>
      <text fg={theme.theme.textMuted}>正在创建会话并提交任务，请稍候...</text>
    </box>
  )
}

export function DialogTaskcheckProposal() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const [busy, setBusy] = createSignal(false)
  const [selected, setSelected] = createSignal<string | undefined>()

  const directory = createMemo(() => sync.data.path.directory || process.cwd())

  onMount(() => {
    dialog.setSize("wide")
  })

  function moveAgent(direction: 1 | -1) {
    const list = local.agent.list()
    const size = list.length
    if (!size) return
    const currentName = "taskcheck"
    const currentIndex = list.findIndex((item) => item.name === currentName)
    const fallbackIndex = list.findIndex((item) => item.name === local.agent.current().name)
    const start = currentIndex !== -1 ? currentIndex : fallbackIndex
    if (start === -1) return
    const nextIndex = (start + direction + size) % size
    const next = list[nextIndex]
    if (!next) return
    if (next.name === "taskcheck") return
    if (next.name === "coding") {
      dialog.replace(() => <DialogCodingProposal />)
      return
    }
    if (next.name === "FixAgent") {
      dialog.replace(() => <DialogFixProposal />)
      return
    }
    local.agent.set(next.name)
    dialog.clear()
  }

  useKeyboard((evt) => {
    if (busy()) return
    if (evt.name !== "tab") return
    evt.preventDefault()
    evt.stopPropagation()
    moveAgent(evt.shift ? -1 : 1)
  })

  const [proposals] = createResource(directory, (dir) => scanProposals(dir))

  createEffect(() => {
    const list = proposals()
    if (proposals.loading) return
    if (!list || list.length > 0) return
    toast.show({
      variant: "warning",
      message: "No proposals found under proposal/",
      duration: 3000,
    })
  })

  const options = createMemo(() => {
    const list = proposals() ?? []
    if (list.length === 0) return []
    return list.map((item) => ({
      value: item.changeId,
      title: item.changeId,
      description: item.description,
    }))
  })
  const proposalMap = createMemo(() => new Map((proposals() ?? []).map((item) => [item.changeId, item.taskPath])))

  if (busy()) {
    return <DialogTaskcheckStarting changeId={selected()} />
  }

  return (
    <DialogSelect
      title="TaskCheck agent: select proposal (change-id)"
      placeholder="Search change-id under proposal/"
      options={options()}
      onSelect={async (option) => {
        if (busy()) return
        setBusy(true)
        setSelected(option.value)

        const model = local.model.current()
        if (!model) {
          toast.show({
            variant: "warning",
            message: "No model selected",
            duration: 3000,
          })
          setBusy(false)
          setSelected(undefined)
          return
        }

        local.agent.set("taskcheck")

        const project = directory()
        const changeId = option.value
        const proposalDir = path.join(project, "proposal", changeId)
        const proposalPath = path.join(proposalDir, "proposal.md")
        const tasks = path.join(proposalDir, "task.md")
        const userInputPath = path.join(proposalDir, "user_input.md")

        const projectText = project.split(path.sep).join("/")
        const proposalText = proposalPath.split(path.sep).join("/")
        const tasksText = tasks.split(path.sep).join("/")

        // 提取用户原始需求（优先级：user_input.md > proposal.md 背景部分 > proposal.md 摘要）
        let userTaskText = ""
        let source = "unknown"

        try {
          userTaskText = await fs.promises.readFile(userInputPath, "utf-8")
          source = "user_input.md"
        } catch {
          // 后备方案：从 proposal.md 提取
          try {
            const proposalContent = await fs.promises.readFile(proposalPath, "utf-8")

            // 尝试提取"背景"或"需求"部分
            const bgMatch = proposalContent.match(/##\s*(背景|需求|用户需求|目标)[^\n]*\n([\s\S]*?)(?=\n##|$)/i)
            if (bgMatch && bgMatch[2]) {
              const content = bgMatch[2].trim()
              userTaskText = content.length > 500 ? content.substring(0, 497) + "..." : content
              source = "proposal.md (背景/需求部分)"
            } else {
              // 取前几段作为摘要
              const paragraphs = proposalContent
                .split('\n\n')
                .filter(p => p.trim() && !p.trim().startsWith('#'))
                .slice(0, 2)
                .join('\n\n')
              userTaskText = paragraphs.length > 500 ? paragraphs.substring(0, 497) + "..." : paragraphs
              source = "proposal.md (摘要)"
            }
          } catch {
            userTaskText = "（无法提取用户原始需求）"
            source = "error"
          }
        }

        // 构建 first user message（严格参照 TraeAgent 格式）
        const promptText = `## 用户原始需求

\`\`\`text
${userTaskText.trim()}
\`\`\`

## 任务上下文

项目路径：\`${projectText}\`
proposal.md路径：\`${proposalText}\`
task.md路径：\`${tasksText}\`

请以"用户原始需求"为覆盖基准，认真检查 task.md 文件是否需要调整。`
        const variant = local.model.variant.current()

        try {
          const sessionID = await sdk.client.session.create({}).then((x) => x.data!.id)
          const messageID = Identifier.ascending("message")

          sdk.client.session
            .prompt({
              sessionID,
              ...model,
              messageID,
              agent: "taskcheck",
              model: model,
              variant,
              parts: [
                {
                  id: Identifier.ascending("part"),
                  type: "text",
                  text: promptText,
                },
              ],
            })
            .catch(() => {})

          setTimeout(() => {
            route.navigate({
              type: "session",
              sessionID,
            })
            dialog.clear()
          }, 50)
        } catch (err) {
          setBusy(false)
          setSelected(undefined)
          toast.show({
            variant: "error",
            message: `Failed to start taskcheck session: ${err}`,
            duration: 5000,
          })
        }
      }}
    />
  )
}
