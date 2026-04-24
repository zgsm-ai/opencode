import { type JSX, type ParentProps, Show } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Gauge } from "lucide-solid"
import { Icon } from "@opencode-ai/ui/icon"
import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import AvatarDisplay from "@/components/avatar-display"
import { usePlatform } from "@/context/platform"
import { type Locale, useLanguage } from "@/context/language"
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
  icon?: "bubble-5" | "store" | "folder" | "folder-add-left" | "configuration" | "inbox" | "task"
  label: string
  active: boolean
  onClick: () => void
  node?: JSX.Element
}) {
  return (
    <Tooltip placement="right" value={props.label}>
      <button
        type="button"
        aria-label={props.label}
        onClick={props.onClick}
        class={item(props.active)}
      >
        {props.node ?? <Icon name={props.icon!} size="normal" />}
      </button>
    </Tooltip>
  )
}

function UserButton() {
  const { user, logout } = useAuth()
  const language = useLanguage()
  const displayName = () => user()?.name || user()?.preferred_username || user()?.email || ""
  const username = () => user()?.preferred_username || user()?.email || user()?.name || ""
  const languageOptions: Locale[] = ["zh", "en"]

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
          <AvatarDisplay avatarUrl={user()?.picture} username={displayName()} class="size-6" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="w-[280px]">
            <div class="px-3 py-2 min-w-0">
              <p class="text-13-medium text-text-strong truncate" title={displayName()}>
                {displayName()}
              </p>
              <p class="text-11-regular text-text-weak mt-0.5 truncate" title={`@${username()}`}>
                @{username()}
              </p>
            </div>
            <DropdownMenu.Separator class="my-0 mx-0" />
            <div class="px-3 py-2 flex items-center justify-between gap-3">
              <span class="text-12-medium leading-none text-text-strong">{language.t("sidebar.user.language")}</span>
              <RadioGroup
                options={languageOptions}
                current={language.locale()}
                size="small"
                pad="none"
                class="leading-none"
                value={(locale) => locale}
                label={(locale) => language.label(locale)}
                onSelect={(locale) => locale && language.setLocale(locale as Locale)}
              />
            </div>
            <DropdownMenu.Separator class="my-0 mx-0" />
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
  const auth = useAuth()

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

  const isKanban = () => {
    const path = appPathname()
    return path === "/kanban" || path.startsWith("/kanban/")
  }

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
          <Show when={auth.canAccessMenu("console.kanban")}>
            <NavButton
              label={language.t("sidebar.kanban")}
              active={isKanban()}
              onClick={() => navigate("/kanban")}
              node={<Gauge size={18} strokeWidth={1.75} aria-hidden="true" />}
            />
          </Show>
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
