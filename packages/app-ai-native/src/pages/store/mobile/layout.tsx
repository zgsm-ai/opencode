import type { ParentProps } from "solid-js"
import { Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { RadioGroup } from "@opencode-ai/ui/radio-group"
import { showToast } from "@opencode-ai/ui/toast"
import AvatarDisplay from "@/components/avatar-display"
import { useAuth } from "@/context/auth"
import { type Locale, useLanguage } from "@/context/language"
import { Toast } from "@opencode-ai/ui/toast"
import { getLoginUrl } from "@/pages/store/lib/auth"

function UserMenu() {
  const { user, logout } = useAuth()
  const language = useLanguage()
  const displayName = () => user()?.name || user()?.preferred_username || user()?.email || ""
  const subjectId = () => user()?.subjectId || user()?.id || ""

  const copySubjectId = () => {
    const id = subjectId()
    if (!id) return
    navigator.clipboard
      .writeText(id)
      .then(() => showToast({ variant: "success", title: "Copied", description: id }))
      .catch(() => {})
  }

  const languageOptions: Locale[] = ["zh", "en"]

  return (
    <Show
      when={user()}
      fallback={
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-text-weak hover:text-text-base hover:bg-[var(--surface-base-hover)] transition-colors outline-none"
          onClick={() => { window.location.href = getLoginUrl() }}
        >
          <AvatarDisplay class="size-5" />
          <span class="text-12-regular max-w-[60px] truncate">{language.t("sidebar.user.signIn")}</span>
        </button>
      }
    >
      <DropdownMenu placement="bottom-end">
        <DropdownMenu.Trigger class="flex items-center rounded-md p-1 hover:bg-[var(--surface-base-hover)] transition-colors outline-none">
          <AvatarDisplay avatarUrl={user()?.picture} username={displayName()} class="size-6" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="w-[280px]">
            <div class="px-3 py-2 min-w-0">
              <p class="text-13-medium text-text-strong truncate" title={displayName()}>{displayName()}</p>
              <p class="text-[10px] text-text-weak mt-0.5 truncate" title={`@${user()?.preferred_username || user()?.email || ""}`}>
                @{user()?.preferred_username || user()?.email || ""}
              </p>
            </div>
            <div class="px-3 py-1.5 flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="text-11-medium text-text-weak">{language.t("sidebar.user.subjectId")}</p>
                <p class="text-11-regular text-text-weak truncate" title={subjectId()}>{subjectId()}</p>
              </div>
              <IconButton icon="copy" variant="ghost" class="shrink-0" onClick={copySubjectId} aria-label={language.t("sidebar.user.copySubjectId")} />
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

function MobileStoreHeader() {
  const language = useLanguage()

  return (
    <div class="shrink-0 flex items-center h-[48px] px-4 border-b border-border bg-background-base">
      <div class="shrink-0 flex items-center">
        <span class="text-[0.9375rem] font-semibold truncate">
          {language.t("sidebar.store")}
        </span>
      </div>
      <div class="flex-1 min-w-0" />
      <div class="shrink-0 flex items-center">
        <UserMenu />
      </div>
    </div>
  )
}

export default function MobileStoreLayout(props: ParentProps) {
  return (
    <>
      <div class="h-full w-full max-w-[100dvw] min-h-0 flex flex-col bg-background-base">
        <MobileStoreHeader />
        <div class="flex min-h-0 flex-1 flex-col">
          {props.children}
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
