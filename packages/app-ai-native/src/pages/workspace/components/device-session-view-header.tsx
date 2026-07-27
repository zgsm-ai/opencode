import { Show, For, createMemo } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useSessionChat } from "@/context/session-chat"
import { SessionQrCodeContent } from "./session-qrcode-dialog"
import { SessionActionMenuItems } from "./session-action-menu"
import { isMobile } from "@/lib/mobile"
import { env } from "@/lib/env"

const mobile = `${(env.BASE_PATH || "").replace(/\/+$/, "")}/workspace/mobile.svg`

export type HeaderState = {
  viewingStack: () => { id: string; name: string }[]
  setViewingStack: (fn: (prev: { id: string; name: string }[]) => { id: string; name: string }[]) => void
  isNew: () => boolean
  userScrolled: () => boolean
  resumeScroll: () => void
  rootSessionID: () => string | undefined
  mobileUrl: () => string
  viewingSessionID: () => string | undefined
  title: () => string | undefined
  onClose?: () => void
}

export function DeviceSessionViewHeader(props: { state: HeaderState }) {
  const s = props.state
  const language = useLanguage()
  const dialog = useDialog()
  const chat = useSessionChat()
  const rootSessionID = createMemo(() => s.rootSessionID())

  return (
    <div class="shrink-0 flex items-center gap-0.5 px-3 h-8 border-b bg-background-base z-10">
      <div class="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden">
        <button
          class="text-12-medium flex items-center min-w-0 truncate"
          classList={{
            "text-text-base": s.viewingStack().length === 0,
            "text-text-weak hover:text-text-base": s.viewingStack().length > 0,
          }}
          onClick={() => s.setViewingStack(() => [])}
        >
          {s.title() ?? language.t("command.session.new")}
        </button>
        <For each={s.viewingStack()}>
          {(entry, idx) => (
            <>
              <Icon name="chevron-right" class="size-3 shrink-0 text-text-weak" />
              <button
                class="text-12-medium min-w-0 truncate"
                classList={{
                  "text-text-base": idx() === s.viewingStack().length - 1,
                  "text-text-weak hover:text-text-base": idx() !== s.viewingStack().length - 1,
                }}
                onClick={() => s.setViewingStack((prev) => prev.slice(0, idx() + 1))}
              >
                {entry.name}
              </button>
            </>
          )}
        </For>
      </div>
      <Show when={!s.isNew()}>
        <div class="shrink-0 flex items-center gap-0.5 ml-1">
          <Show when={s.userScrolled()}>
            <Tooltip value={language.t("session.messages.jumpToLatest")} placement="bottom">
              <IconButton
                icon="arrow-down-to-line"
                variant="ghost"
                iconSize="small"
                class="size-6 rounded-md"
                onClick={s.resumeScroll}
              />
            </Tooltip>
          </Show>
          <Show when={!s.viewingSessionID() && !isMobile()}>
            <Show when={s.mobileUrl()}>
              <Tooltip value={language.t("session.qrcode.title")} placement="bottom">
                <button
                  type="button"
                  data-component="icon-button"
                  data-icon="mobile"
                  data-size="normal"
                  data-variant="ghost"
                  class="size-6 rounded-md"
                  aria-label={language.t("session.qrcode.title")}
                  onClick={() => {
                    dialog.show(() => (
                      <SessionQrCodeContent
                        url={s.mobileUrl()!}
                        sessionTitle={s.title() ?? language.t("command.session.new")}
                      />
                    ))
                  }}
                >
                  <img src={mobile} alt="" aria-hidden="true" class="size-5" />
                </button>
              </Tooltip>
            </Show>
            <DropdownMenu gutter={4} placement="bottom-end">
              <DropdownMenu.Trigger
                as={IconButton}
                icon="dot-grid"
                variant="ghost"
                iconSize="small"
                class="size-6 rounded-md"
                aria-label={language.t("common.moreOptions")}
              />
              <DropdownMenu.Portal>
                <DropdownMenu.Content style={{ "min-width": "104px" }}>
                  <Show when={rootSessionID()}>
                    <SessionActionMenuItems
                      sessionID={rootSessionID()!}
                      getTitle={() => chat.getSession(rootSessionID()!)?.title ?? ""}
                      onRename={(title) => chat.renameSession(rootSessionID()!, title)}
                      onDelete={() => chat.deleteSession(rootSessionID()!)}
                      onDeleted={() => s.onClose?.()}
                    />
                  </Show>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          </Show>
        </div>
      </Show>
    </div>
  )
}
