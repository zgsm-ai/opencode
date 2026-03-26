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
import { getLoginUrl } from "@/pages/store/lib/auth"
import { DialogSettings } from "@/components/dialog-settings"

function NavButton(props: {
   icon: "bubble-5" | "store" | "folder"
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
            classList={{
               "flex items-center justify-center size-10 rounded-lg transition-colors cursor-default outline-none": true,
               "bg-surface-base text-icon-strong-base shadow-xs-border-base/30": props.active,
               "text-icon-weak-base hover:bg-surface-base-hover hover:text-icon-base": !props.active,
            }}
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
               class="flex items-center justify-center size-8 rounded-md hover:bg-surface-base transition-colors"
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

   const isWorkspace = () => location.pathname.startsWith("/workspace")
   const isStore = () => location.pathname.startsWith("/store")

   return (
      <div class="flex h-full w-full overflow-hidden">
         <div class="w-12 shrink-0 bg-background-base flex flex-col items-center py-3 gap-2 border-r border-border-weak-base">
            <NavButton icon="folder" label="Workspace" active={isWorkspace()} onClick={() => navigate("/workspace")} />
            <NavButton
               icon="store"
               label={language.t("sidebar.store")}
               active={isStore()}
               onClick={() => navigate("/store")}
            />
            <div class="flex-1" />
            <UserButton />
            <Show when={useAuth().user()}>
               <Tooltip placement="right" value={language.t("sidebar.user.console")}>
                  <IconButton
                     icon="sliders"
                     variant="ghost"
                     size="large"
                     onClick={() => navigate("/store/dashboard")}
                     aria-label={language.t("sidebar.user.console")}
                  />
               </Tooltip>
            </Show>
            <Tooltip placement="right" value={language.t("sidebar.settings")}>
               <IconButton
                  icon="settings-gear"
                  variant="ghost"
                  size="large"
                  onClick={() => dialog.show(() => <DialogSettings />)}
                  aria-label={language.t("sidebar.settings")}
               />
            </Tooltip>
            <Tooltip placement="right" value={language.t("sidebar.help")}>
               <IconButton
                  icon="help"
                  variant="ghost"
                  size="large"
                  onClick={() => platform.openLink("https://docs.costrict.ai/cli/guide/installation")}
                  aria-label={language.t("sidebar.help")}
               />
            </Tooltip>
         </div>
         <div class="flex-1 min-w-0 h-full overflow-hidden">{props.children}</div>
      </div>
   )
}
