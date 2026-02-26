import { createEffect, createMemo, createResource, createSignal } from "solid-js"
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
import { DialogTaskcheckProposal } from "@tui/component/dialog-taskcheck-proposal"
import fs from "fs"
import path from "path"

async function scanProposals(directory: string) {
  const root = path.join(directory, "proposal")
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => [])
  const results: { changeId: string; description?: string; time: number; taskPath: string }[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const tasks = path.join(root, entry.name, "tasks.md")
    const task = path.join(root, entry.name, "task.md")
    const taskPath = await fs.promises
      .access(tasks)
      .then(() => tasks)
      .catch(async () => fs.promises.access(task).then(() => task).catch(() => undefined))
    if (!taskPath) continue
    const time = await fs.promises
      .stat(taskPath)
      .then((stat) => stat.mtimeMs)
      .catch(() => 0)
    const proposalPath = path.join(root, entry.name, "proposal.md")
    const description = await fs.promises
      .readFile(proposalPath, "utf-8")
      .then((content) => {
        const firstLine = content
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0 && !line.startsWith("#"))
        if (!firstLine) return undefined
        return firstLine.length > 80 ? firstLine.slice(0, 77) + "..." : firstLine
      })
      .catch(() => undefined)
    results.push({ changeId: entry.name, description, time, taskPath })
  }
  return results.toSorted((a, b) => b.time - a.time)
}

function DialogFixStarting(props: { changeId?: string }) {
  const { theme } = useTheme()
  useKeyboard((evt) => {
    if (evt.name !== "escape" && evt.name !== "tab") return
    evt.preventDefault()
    evt.stopPropagation()
  })
  return (
    <box paddingLeft={4} paddingRight={4} gap={1} paddingBottom={1}>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        Fix agent 启动中
      </text>
      <text fg={theme.textMuted}>change-id: {props.changeId ?? "-"}</text>
      <text fg={theme.textMuted}>正在创建会话并提交任务，请稍候...</text>
    </box>
  )
}

export function DialogFixProposal() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const route = useRoute()
  const dialog = useDialog()
  const toast = useToast()
  const [busy, setBusy] = createSignal(false)
  const [selected, setSelected] = createSignal<string | undefined>()

  const directory = createMemo(() => sync.data.path.directory || process.cwd())

  function moveAgent(direction: 1 | -1) {
    const list = local.agent.list()
    const size = list.length
    if (!size) return
    const currentName = "FixAgent"
    const currentIndex = list.findIndex((item) => item.name === currentName)
    const fallbackIndex = list.findIndex((item) => item.name === local.agent.current().name)
    const start = currentIndex !== -1 ? currentIndex : fallbackIndex
    if (start === -1) return
    const nextIndex = (start + direction + size) % size
    const next = list[nextIndex]
    if (!next) return
    if (next.name === "FixAgent") return
    if (next.name === "coding") {
      dialog.replace(() => <DialogCodingProposal />)
      return
    }
    if (next.name === "taskcheck") {
      dialog.replace(() => <DialogTaskcheckProposal />)
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
    return <DialogFixStarting changeId={selected()} />
  }

  return (
    <DialogSelect
      title="Fix agent: select proposal (change-id)"
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

        local.agent.set("FixAgent")

        const project = directory()
        const tasks = proposalMap().get(option.value) ?? path.join(project, "proposal", option.value, "tasks.md")
        const projectText = project.split(path.sep).join("/")
        const tasksText = tasks.split(path.sep).join("/")
        const promptText = `项目路径：\`${projectText}\`\n任务文件路径：\`${tasksText}\`\n\n请认真收集用户反馈并进行代码修复和改进`
        const variant = local.model.variant.current()

        try {
          const sessionID = await sdk.client.session.create({}).then((x) => x.data!.id)
          const messageID = Identifier.ascending("message")

          sdk.client.session
            .prompt({
              sessionID,
              ...model,
              messageID,
              agent: "FixAgent",
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
            message: `Failed to start fix session: ${err}`,
            duration: 5000,
          })
        }
      }}
    />
  )
}
