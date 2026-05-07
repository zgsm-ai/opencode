import { useNavigate, useParams } from "@solidjs/router"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useConversationAdapter } from "@/context/device-adapter"
import { useWorkspaceNavigate } from "@/hooks/use-workspace-navigate"
import { DialogSelectFile } from "@/components/dialog-select-file"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { DialogSelectMcp } from "@/components/dialog-select-mcp"
import { DialogSelectAgent } from "@/components/dialog-select-agent"
import { DialogSelectVariant } from "@/components/dialog-select-variant"
import { DialogSelectProvider } from "@/components/dialog-select-provider"
import { DialogFork } from "@/components/dialog-fork"
import { DialogSessionRename } from "@/components/dialog-session-rename"
import { DialogSessionList } from "@/components/dialog-session-list"
import { DialogTimeline } from "@/components/dialog-timeline"
import { DialogThemeList } from "@/components/dialog-theme-list"
import { DialogHelp } from "@/components/dialog-help"
import { DialogCredit } from "@/components/dialog-credit"
import { DialogStatus } from "@/components/dialog-status"
import { DialogSkills } from "@/components/dialog-skills"
import { DialogFavorites } from "@/components/dialog-favorites"
import { exportTranscriptAsMarkdown, downloadFile } from "@/utils/session-export"

export function useSlashActions() {
  const dialog = useDialog()
  const navigate = useNavigate()
  const params = useParams()
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const conversation = useConversationAdapter()
  const language = useLanguage()
  const layout = useLayout()
  const { navigateToSession } = useWorkspaceNavigate()

  const sessionID = () => params.id
  const directory = () => params.dir

  const execute = (name: string) => {
    switch (name) {
      case "new": {
        navigate(`/workspace/${params.workspaceID}`)
        break
      }
      case "sessions":
      case "resume":
      case "continue": {
        dialog.show(() => <DialogSessionList />)
        break
      }
      case "workspaces": {
        const dir = directory()
        if (dir) layout.sidebar.toggleWorkspaces(dir)
        break
      }
      case "models": {
        dialog.show(() => <DialogSelectModel />)
        break
      }
      case "agents": {
        dialog.show(() => <DialogSelectAgent />)
        break
      }
      case "mcps": {
        dialog.show(() => <DialogSelectMcp />)
        break
      }
      case "variants": {
        dialog.show(() => <DialogSelectVariant />)
        break
      }
      case "connect": {
        dialog.show(() => <DialogSelectProvider />)
        break
      }
      case "status": {
        dialog.show(() => <DialogStatus />)
        break
      }
      case "credit": {
        dialog.show(() => <DialogCredit />)
        break
      }
      case "themes": {
        dialog.show(() => <DialogThemeList />)
        break
      }
      case "help": {
        dialog.show(() => <DialogHelp />)
        break
      }
      case "favorites":
      case "fav": {
        dialog.show(() => <DialogFavorites />)
        break
      }
      case "skills": {
        dialog.show(() => <DialogSkills />)
        break
      }
      case "share": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.share.noSession") })
          return
        }
        sdk.client.session
          .share({ id: sid })
          .then((res) => {
            const url = res.data?.share?.url
            if (url) {
              navigator.clipboard
                .writeText(url)
                .then(() =>
                  showToast({
                    title: language.t("command.session.share.copied"),
                    variant: "success",
                  }),
                )
                .catch(() =>
                  showToast({
                    title: language.t("command.session.share.success"),
                    description: url,
                    variant: "success",
                  }),
                )
            }
          })
          .catch((err) =>
            showToast({
              title: language.t("command.session.share.error"),
              description: err instanceof Error ? err.message : undefined,
              variant: "error",
            }),
          )
        break
      }
      case "unshare": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.unshare.noSession") })
          return
        }
        sdk.client.session
          .unshare({ id: sid })
          .then(() =>
            showToast({
              title: language.t("command.session.unshare.success"),
              variant: "success",
            }),
          )
          .catch((err) =>
            showToast({
              title: language.t("command.session.unshare.error"),
              description: err instanceof Error ? err.message : undefined,
              variant: "error",
            }),
          )
        break
      }
      case "rename": {
        dialog.show(() => <DialogSessionRename />)
        break
      }
      case "timeline": {
        dialog.show(() => <DialogTimeline />)
        break
      }
      case "fork": {
        dialog.show(() => <DialogFork />)
        break
      }
      case "compact": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.compact.noSession") })
          return
        }
        conversation
          .sessionCommand({ sessionID: sid, command: "/compact" })
          .catch((err) =>
            showToast({
              title: language.t("command.session.compact.error"),
              description: err instanceof Error ? err.message : undefined,
              variant: "error",
            }),
          )
        break
      }
      case "undo": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.undo.noSession") })
          return
        }
        sdk.client.session
          .revert({ id: sid })
          .then(() =>
            showToast({
              title: language.t("command.session.undo.success"),
              variant: "success",
            }),
          )
          .catch((err) =>
            showToast({
              title: language.t("command.session.undo.error"),
              description: err instanceof Error ? err.message : undefined,
              variant: "error",
            }),
          )
        break
      }
      case "redo": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.redo.noSession") })
          return
        }
        sdk.client.session
          .unrevert({ id: sid })
          .then(() =>
            showToast({
              title: language.t("command.session.redo.success"),
              variant: "success",
            }),
          )
          .catch((err) =>
            showToast({
              title: language.t("command.session.redo.error"),
              description: err instanceof Error ? err.message : undefined,
              variant: "error",
            }),
          )
        break
      }
      case "copy": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.copy.noSession") })
          return
        }
        const messages = sync.data.message[sid] ?? []
        const md = exportTranscriptAsMarkdown(messages, (msgID) => sync.data.part[msgID] ?? [])
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
        break
      }
      case "export": {
        const sid = sessionID()
        if (!sid) {
          showToast({ title: language.t("command.session.export.noSession") })
          return
        }
        const messages = sync.data.message[sid] ?? []
        const md = exportTranscriptAsMarkdown(messages, (msgID) => sync.data.part[msgID] ?? [])
        downloadFile(`session-${sid}.md`, md)
        showToast({
          title: language.t("command.session.export.success"),
          variant: "success",
        })
        break
      }
      case "timestamps":
      case "toggle-timestamps": {
        // Placeholder: toggle timestamp display in session messages
        showToast({ title: language.t("command.timestamps.placeholder") })
        break
      }
      case "thinking":
      case "toggle-thinking": {
        // Placeholder: toggle thinking process display
        showToast({ title: language.t("command.thinking.placeholder") })
        break
      }
      case "open": {
        dialog.show(() => <DialogSelectFile onOpenFile={() => {}} />)
        break
      }
      case "terminal": {
        layout.view(sessionID() ?? "").terminal.toggle()
        break
      }
      default: {
        showToast({ title: language.t("command.unknown", { command: name }) })
      }
    }
  }

  return { execute }
}
