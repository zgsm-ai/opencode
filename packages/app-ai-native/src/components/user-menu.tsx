import { useLocation } from "@solidjs/router"
import { type JSX, Show } from "solid-js"
import { Sun, Moon } from "lucide-solid"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { useTheme } from "@opencode-ai/ui/theme"
import AvatarDisplay from "@/components/avatar-display"
import { type Locale, useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { appPath } from "@/lib/router"

export function UserMenuContent() {
  const { user, logout } = useAuth()
  const language = useLanguage()
  const theme = useTheme()
  const location = useLocation()

  const displayName = () => user()?.name || user()?.preferred_username || user()?.email || ""
  const username = () => user()?.preferred_username || user()?.email || user()?.name || ""
  const subjectId = () => user()?.subjectId || user()?.id || ""
  const landing = () => appPath(location.pathname) === "/"
  const languageOptions: Locale[] = ["zh", "en"]

  const isDarkMode = () => {
    const scheme = theme.colorScheme()
    if (scheme === "dark") return true
    if (scheme === "light") return false
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  }

  return (
    <DropdownMenu.Content class="w-[280px]">
      <div class="px-2 pt-2 pb-0.5 min-w-0">
        <p class="text-13-medium text-text-strong truncate" style={{ "font-weight": 600 }} title={displayName()}>
          {displayName()}
        </p>
      </div>
      <div class="px-2 py-1.5 flex items-center gap-2">
        <span class="text-11-medium text-text-weak shrink-0">{language.t("sidebar.user.subjectId")}</span>
        <span class="text-11-regular text-text-weak truncate min-w-0 flex-1" title={subjectId()}>
          {subjectId()}
        </span>
        <IconButton
          icon="copy"
          variant="ghost"
          class="shrink-0"
          onClick={() => {
            const id = subjectId()
            if (!id) return
            navigator.clipboard.writeText(id).catch(() => {})
          }}
          aria-label={language.t("sidebar.user.copySubjectId")}
        />
      </div>
      <DropdownMenu.Separator class="my-0 mx-0" />
      <div class="px-2 py-1.5 flex items-center justify-between gap-3">
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
      <Show when={!landing()}>
        <div class="px-2 py-1.5 flex items-center justify-between gap-3">
          <span class="text-12-medium leading-none text-text-strong">{language.t("settings.general.row.appearance.title")}</span>
          <button
            type="button"
            data-action="user-menu-color-scheme"
            onClick={() => theme.setColorScheme(isDarkMode() ? "light" : "dark")}
            class="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--native-surface)] text-[var(--native-dim)] hover:text-[var(--native-foreground)]"
            aria-label={isDarkMode() ? language.t("theme.scheme.light") : language.t("theme.scheme.dark")}
          >
            {isDarkMode() ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <DropdownMenu.Separator class="my-0 mx-0" />
      </Show>
      <div
        class="mt-1 px-2 py-1.5 flex items-center justify-between gap-3 cursor-pointer transition-colors rounded-sm hover:bg-accent"
        onClick={logout}
      >
        <span class="text-12-medium leading-none text-text-strong">{language.t("sidebar.user.signOut")}</span>
      </div>
    </DropdownMenu.Content>
  )
}

export function UserDropdown(props: {
  placement?: "bottom-end" | "right-end"
  trigger: JSX.Element
}) {
  return (
    <DropdownMenu placement={props.placement ?? "bottom-end"}>
      {props.trigger}
      <DropdownMenu.Portal>
        <UserMenuContent />
      </DropdownMenu.Portal>
    </DropdownMenu>
  )
}
