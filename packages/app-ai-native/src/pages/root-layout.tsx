import { type ParentProps, Show } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { appPath } from "@/lib/router"
import { getLoginUrl } from "@/pages/store/lib/auth"

function item(on: boolean) {
  return [
    "relative flex size-10 cursor-pointer items-center justify-center rounded-[var(--native-radius-md)] outline-none transition-colors",
    on
      ? "bg-[color-mix(in_srgb,var(--native-primary)_10%,transparent)] text-[var(--native-primary)] before:absolute before:top-2 before:bottom-2 before:left-[-0.5rem] before:w-[2px] before:rounded-r-full before:bg-[var(--native-primary)] before:content-['']"
      : "text-[var(--native-dim)] hover:bg-[var(--native-surface)] hover:text-[var(--native-foreground)]",
  ].join(" ")
}

function NavButton(props: {
  icon: "bubble-5" | "store" | "folder" | "folder-add-left" | "configuration" | "inbox"
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
        class={item(props.active)}
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
          <button
            type="button"
            class={item(false)}
            aria-label={language.t("sidebar.user.signIn")}
            onClick={() => {
              window.location.href = getLoginUrl()
            }}
          >
            <Icon name="glasses" size="normal" />
          </button>
        </Tooltip>
      }
    >
      <DropdownMenu placement="right-end">
        <DropdownMenu.Trigger
          class={item(false)}
          aria-label={language.t("sidebar.user.menu")}
        >
          <Show when={user()?.picture} fallback={<Icon name="eye" size="normal" />}>
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
  const isProjects = () => location.pathname.startsWith("/projects")

  const isConsole = () => {
    const path = appPathname()
    return path === "/console" || path.startsWith("/console/")
  }

  return (
    <div class="flex h-full w-full overflow-hidden">
      <aside
        data-component="root-layout-nav"
        class="fixed inset-y-0 left-0 z-40 flex w-12 flex-col items-center border-r border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] bg-[var(--native-panel)] py-4 transition-opacity duration-200"
      >
        <nav class="flex flex-1 flex-col gap-2">
          <NavButton
            icon="store"
            label={language.t("sidebar.store")}
            active={isStore()}
            onClick={() => navigate("/store")}
          />
          <NavButton
            icon="inbox"
            label={language.t("sidebar.projects")}
            active={isProjects()}
            onClick={() => navigate("/projects")}
          />
          <NavButton
            icon="folder"
            label={language.t("sidebar.workspace")}
            active={isWorkspace()}
            onClick={() => navigate("/workspace")}
          />
        </nav>
        <div class="mt-auto flex flex-col gap-2">
          <UserButton />
          <NavButton
            icon="configuration"
            label={language.t("sidebar.console")}
            active={isConsole()}
            onClick={() => navigate("/console/capabilities")}
          />
          {/* TODO: 未来恢复设置入口后，再重新展示设置按钮，并放开语言/主题切换能力。 */}
          <Tooltip placement="right" value={language.t("sidebar.help")}>
            <button
              type="button"
              onClick={() => platform.openLink("https://docs.costrict.ai/cli/guide/installation")}
              class={item(false)}
              aria-label={language.t("sidebar.help")}
            >
              <Icon name="help" size="normal" />
            </button>
          </Tooltip>
        </div>
      </aside>
      <div class="flex-1 min-w-0 h-full overflow-hidden ml-[48px] flex flex-col">{props.children}</div>
    </div>
  )
}
