import type { ParentProps } from "solid-js"
import { Show } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import AvatarDisplay from "@/components/avatar-display"
import { UserDropdown } from "@/components/user-menu"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { Toast } from "@opencode-ai/ui/toast"
import { getLoginUrl } from "@/pages/store/lib/auth"

function UserMenu() {
  const { user } = useAuth()
  const language = useLanguage()
  const displayName = () => user()?.name || user()?.preferred_username || user()?.email || ""

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
      <UserDropdown
        trigger={
          <DropdownMenu.Trigger class="flex items-center rounded-md p-1 hover:bg-[var(--surface-base-hover)] transition-colors outline-none">
            <AvatarDisplay avatarUrl={user()?.picture} username={displayName()} class="size-6" />
          </DropdownMenu.Trigger>
        }
      />
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
