import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Keybind } from "@opencode-ai/ui/keybind"
import { showToast } from "@opencode-ai/ui/toast"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { getFilename } from "@opencode-ai/util/path"
import { createMemo, Show } from "solid-js"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useDeviceLocal } from "@/context/device-local"
import { useDeviceSDK } from "@/context/device-sdk"
import { Portal } from "solid-js/web"

const showRequestError = (language: ReturnType<typeof useLanguage>, err: unknown) => {
  showToast({
    variant: "error",
    title: language.t("common.requestFailed"),
    description: err instanceof Error ? err.message : String(err),
  })
}

export function SessionHeader() {
  const layout = useLayout()
  const command = useCommand()
  const local = useDeviceLocal()
  const sdk = useDeviceSDK()
  const platform = usePlatform()
  const language = useLanguage()

  const workspaceDirectory = createMemo(() => sdk.directory ?? "")
  const workspace = createMemo(() => {
    const directory = workspaceDirectory()
    if (!directory) return
    return layout.projects.list().find((p) => p.worktree === directory || p.sandboxes?.includes(directory))
  })
  const name = createMemo(() => {
    const current = workspace()
    if (current) return current.name || getFilename(current.worktree)
    return getFilename(workspaceDirectory())
  })
  const hotkey = createMemo(() => command.keybind("file.open"))

  const sessionKey = createMemo(() => local.activeSessionID() ?? "")
  const view = createMemo(() => layout.view(sessionKey))

  const copyPath = () => {
    const directory = workspaceDirectory()
    if (!directory) return
    navigator.clipboard
      .writeText(directory)
      .then(() => {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("session.share.copy.copied"),
          description: directory,
        })
      })
      .catch((err: unknown) => showRequestError(language, err))
  }

  const centerMount = createMemo(() => document.getElementById("opencode-titlebar-center"))
  const rightMount = createMemo(() => document.getElementById("opencode-titlebar-right"))

  return (
    <>
      <Show when={centerMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <Button
              type="button"
              variant="ghost"
              size="small"
              class="hidden md:flex w-[240px] max-w-full min-w-0 pl-0.5 pr-2 items-center gap-2 justify-between rounded-md border border-border-weak-base bg-surface-panel shadow-none cursor-default"
              onClick={() => command.trigger("file.open")}
              aria-label={language.t("session.header.searchFiles")}
            >
              <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
                <Icon name="magnifying-glass" size="small" class="icon-base shrink-0 size-4" />
                <span class="flex-1 min-w-0 text-12-regular text-text-weak truncate text-left">
                  {language.t("session.header.search.placeholder", {
                    project: name(),
                  })}
                </span>
              </div>

              <Show when={hotkey()}>
                {(keybind) => (
                  <Keybind class="shrink-0 !border-0 !bg-transparent !shadow-none px-0">{keybind()}</Keybind>
                )}
              </Show>
            </Button>
          </Portal>
        )}
      </Show>
      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
              <div class="flex items-center gap-2">
              <Show when={workspaceDirectory()}>
                <div class="hidden xl:flex items-center">
                  <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                    <Button
                      variant="ghost"
                      class="rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none"
                      onClick={copyPath}
                      aria-label={language.t("session.header.open.copyPath")}
                    >
                      <Icon name="copy" size="small" class="text-icon-base" />
                      <span class="text-12-regular text-text-strong">
                        {language.t("session.header.open.copyPath")}
                      </span>
                    </Button>
                  </div>
                </div>
              </Show>
              <div class="flex items-center gap-1">
                <div class="hidden md:flex items-center gap-1 shrink-0">
                  <TooltipKeybind
                    title={language.t("command.terminal.toggle")}
                    keybind={command.keybind("terminal.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/terminal-toggle titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => view().terminal.toggle()}
                      aria-label={language.t("command.terminal.toggle")}
                      aria-expanded={view().terminal.opened()}
                      aria-controls="terminal-panel"
                    >
                      <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                        <Icon
                          size="small"
                          name={view().terminal.opened() ? "layout-bottom-partial" : "layout-bottom"}
                          class="group-hover/terminal-toggle:hidden"
                        />
                        <Icon
                          size="small"
                          name="layout-bottom-partial"
                          class="hidden group-hover/terminal-toggle:inline-block"
                        />
                        <Icon
                          size="small"
                          name={view().terminal.opened() ? "layout-bottom" : "layout-bottom-partial"}
                          class="hidden group-active/terminal-toggle:inline-block"
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.review.toggle")}
                    keybind={command.keybind("review.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="group/review-toggle titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => view().reviewPanel.toggle()}
                      aria-label={language.t("command.review.toggle")}
                      aria-expanded={view().reviewPanel.opened()}
                      aria-controls="review-panel"
                    >
                      <div class="relative flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                        <Icon
                          size="small"
                          name={view().reviewPanel.opened() ? "layout-right-partial" : "layout-right"}
                          class="group-hover/review-toggle:hidden"
                        />
                        <Icon
                          size="small"
                          name="layout-right-partial"
                          class="hidden group-hover/review-toggle:inline-block"
                        />
                        <Icon
                          size="small"
                          name={view().reviewPanel.opened() ? "layout-right" : "layout-right-partial"}
                          class="hidden group-active/review-toggle:inline-block"
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>

                  <TooltipKeybind
                    title={language.t("command.fileTree.toggle")}
                    keybind={command.keybind("fileTree.toggle")}
                  >
                    <Button
                      variant="ghost"
                      class="titlebar-icon w-8 h-6 p-0 box-border"
                      onClick={() => layout.fileTree.toggle()}
                      aria-label={language.t("command.fileTree.toggle")}
                      aria-expanded={layout.fileTree.opened()}
                      aria-controls="file-tree-panel"
                    >
                      <div class="relative flex items-center justify-center size-4">
                        <Icon
                          size="small"
                          name={layout.fileTree.opened() ? "file-tree-active" : "file-tree"}
                          classList={{
                            "text-icon-strong": layout.fileTree.opened(),
                            "text-icon-weak": !layout.fileTree.opened(),
                          }}
                        />
                      </div>
                    </Button>
                  </TooltipKeybind>
                </div>
              </div>
            </div>
          </Portal>
        )}
      </Show>
    </>
  )
}
