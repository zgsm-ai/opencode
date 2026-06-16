import { useNavigate, useParams } from "@solidjs/router"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useDeviceLocal } from "@/context/device-local"
import { useDeviceSDK } from "@/context/device-sdk"
import { useDeviceSessionStore } from "@/context/device-session"
import { useConversationAdapter } from "@/context/device-adapter"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { DialogSelectAgent } from "@/components/dialog-select-agent"
import { DialogFavorites } from "@/components/dialog-favorites"

function exportTranscriptAsMarkdown(messages: any[], getParts: (id: string) => any[]): string {
  const lines: string[] = []
  for (const message of messages) {
    const role = message.role === "user" ? "User" : "Assistant"
    lines.push(`## ${role}`, "")
    for (const part of getParts(message.id)) {
      if (part.type === "text" && !part.synthetic && !part.ignored) lines.push(part.text, "")
      if (part.type === "reasoning") lines.push(`_Thinking:_ ${part.text}`, "")
      if (part.type === "tool") lines.push(`> Tool: ${part.tool}`, "")
    }
  }
  return lines.join("\n")
}

export function useSlashActions() {
  const navigate = useNavigate()
  const params = useParams()
  const local = useDeviceLocal()
  const store = useDeviceSessionStore()
  const sdk = useDeviceSDK()
  const conversation = useConversationAdapter()
  const language = useLanguage()
  const layout = useLayout()
  const dialog = useDialog()

  const sessionID = () => local.activeSessionID()
  const directory = () => sdk.directory

  const execute = (name: string) => {
    switch (name) {
      case "new":
      case "clear": {
        navigate(`/workspace/${params.workspaceID ?? ""}`)
        return
      }
      case "workspaces": {
        const dir = directory()
        if (dir) layout.sidebar.toggleWorkspaces(dir)
        return
      }
      case "models": {
        dialog.show(() => <DialogSelectModel />)
        return
      }
      case "agents": {
        dialog.show(() => <DialogSelectAgent />)
        return
      }
      case "hub":
      case "favorites": {
        dialog.show(() => <DialogFavorites />)
        return
      }
      case "copy": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.copy.noSession") })
          return
        }
        const messages = store.data.messages[sid] ?? []
        const md = exportTranscriptAsMarkdown(messages, (msgID) => store.data.parts[msgID] ?? [])
        navigator.clipboard
          .writeText(md)
          .then(() =>
            showToast({
              title: language.t("command.session.copy.success"),
              variant: "success",
            }),
          )
          .catch(() =>
            showToast({
              title: language.t("command.session.copy.error"),
              variant: "error",
            }),
          )
        return
      }
      case "timestamps":
      case "toggle-timestamps": {
        showToast({ title: language.t("command.timestamps.placeholder") })
        return
      }
      case "thinking":
      case "toggle-thinking": {
        showToast({ title: language.t("command.thinking.placeholder") })
        return
      }
      case "terminal": {
        layout.view(sessionID() ?? "").terminal.toggle()
        return
      }
    }

    const sid = sessionID()
    if (!sid) return
    conversation.sessionCommand({ sessionID: sid, command: name }).catch((err) =>
      showToast({
        title: language.t("prompt.toast.commandSendFailed.title"),
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      }),
    )
  }

  return { execute }
}
