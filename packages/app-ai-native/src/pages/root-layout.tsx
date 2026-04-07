import { type ParentProps, Show } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { appPath } from "@/lib/router"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { DialogSettings } from "@/components/dialog-settings"

function NavButton(props: {
  icon: "bubble-5" | "store" | "folder" | "sliders"
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Tooltip placement="right" value={props.label}>
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        class={[
          "flex items-center justify-center size-10 transition-colors cursor-pointer outline-none",
          props.active
            ? "bg-[#2E6CC4]/10 text-[#2E6CC4] border-l-2 border-l-[#2E6CC4]"
            : "text-[var(--st-text-muted)] hover:bg-[var(--st-surface)] hover:text-[var(--st-text)]",
        ].join(" ")}
      >
        <Icon name={props.icon} size="normal" />
      </button>
    </Tooltip>
  )
}

function UserButton() {
  const { user, logout } = useAuth()
  const language = useLanguage()

  return (
    <Show
      when={user()}
      fallback={
        <Tooltip placement="right" value={language.t("sidebar.user.signIn")}>
          <IconButton
            icon="glasses"
            variant="ghost"
            size="large"
            aria-label={language.t("sidebar.user.signIn")}
            onClick={() => {
              window.location.href = getLoginUrl()
            }}
          />
        </Tooltip>
      }
    >
      <DropdownMenu placement="right-end">
        <DropdownMenu.Trigger
          class="flex items-center justify-center size-10 hover:bg-[var(--st-surface)] transition-colors"
          aria-label={language.t("sidebar.user.menu")}
        >
          <Show
            when={user()?.picture}
            fallback={
              <IconButton icon="eye" variant="ghost" size="large" aria-label={language.t("sidebar.user.menu")} />
            }
          >
            <img src={user()?.picture} alt="" class="size-6 rounded-full" />
          </Show>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <div class="px-3 py-2 border-b border-border-weak-base">
              <p class="text-13-medium text-text-strong truncate">
                {user()?.preferred_username || user()?.name || user()?.email}
              </p>
              <Show when={user()?.email}>
                <p class="text-11-regular text-text-weak truncate">{user()?.email}</p>
              </Show>
            </div>
            <DropdownMenu.Item onSelect={logout}>
              <DropdownMenu.ItemLabel>{language.t("sidebar.user.signOut")}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </Show>
  )
}

export default function RootLayout(props: ParentProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const dialog = useDialog()
  const platform = usePlatform()
  const language = useLanguage()

  const appPathname = () => appPath(location.pathname)

  const isWorkspace = () => {
    const path = appPathname()
    return path === "/workspace" || path.startsWith("/workspace/")
  }

  const isStore = () => {
    const path = appPathname()
    return path === "/store" || path.startsWith("/store/")
  }

  return (
    <div class="flex h-full w-full overflow-hidden">
      <aside class="fixed inset-y-0 left-0 z-40 flex w-12 flex-col items-center py-4" style={{ background: "var(--st-surface-lowest)", "border-right": "1px solid rgba(194,198,212,0.2)" }}>
        <nav class="flex flex-1 flex-col gap-2">
          <NavButton
            icon="store"
            label={language.t("sidebar.store")}
            active={isStore()}
            onClick={() => navigate("/store")}
          />
          <NavButton icon="folder" label="Workspace" active={isWorkspace()} onClick={() => navigate("/workspace")} />
        </nav>
        <div class="mt-auto flex flex-col gap-2">
          <UserButton />
          <Tooltip placement="right" value={language.t("sidebar.console")}>
            <button
              type="button"
              onClick={() => navigate("/store/dashboard")}
              class="flex size-10 items-center justify-center text-[var(--st-text-muted)] transition-colors hover:bg-[var(--st-surface)] hover:text-[var(--st-text)]"
              aria-label={language.t("sidebar.console")}
            >
              <Icon name="sliders" size="normal" />
            </button>
          </Tooltip>
          <Tooltip placement="right" value={language.t("sidebar.settings")}>
            <button
              type="button"
              onClick={() => dialog.show(() => <DialogSettings />)}
              class="flex size-10 items-center justify-center text-[var(--st-text-muted)] transition-colors hover:bg-[var(--st-surface)] hover:text-[var(--st-text)]"
              aria-label={language.t("sidebar.settings")}
            >
              <Icon name="settings-gear" />
            </button>
          </Tooltip>
          <Tooltip placement="right" value={language.t("sidebar.help")}>
            <button
              type="button"
              onClick={() => platform.openLink("https://docs.costrict.ai/cli/guide/installation")}
              class="flex size-10 items-center justify-center text-[var(--st-text-muted)] transition-colors hover:bg-[var(--st-surface)] hover:text-[var(--st-text)]"
              aria-label={language.t("sidebar.help")}
            >
              <Icon name="help" />
            </button>
          </Tooltip>
        </div>
      </aside>
      <div class="flex-1 min-w-0 h-full overflow-hidden ml-[48px]">{props.children}</div>
    </div>
  )
}
