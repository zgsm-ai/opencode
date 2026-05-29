import { Show } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { Icon } from "@opencode-ai/ui/icon"

export default function TopNav() {
  const language = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <nav class="flex h-14 items-center justify-between border-b border-[var(--native-border)] bg-[var(--native-panel)] px-6">
      {/* Left: Logo */}
      <A href="/store" class="flex items-center gap-2">
        <span class="text-lg font-bold text-[var(--native-foreground)]">
          {language.t("store.browse.title")}
        </span>
      </A>

      {/* Right: Actions */}
      <div class="flex items-center gap-3">
        <Show when={auth.user()}>
          {/* Admin button */}
          <button
            type="button"
            onClick={() => navigate("/store-admin")}
            class="flex items-center gap-2 rounded-lg bg-[var(--native-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--native-primary-hover)]"
          >
            <Icon name="settings-gear" class="size-4" />
            <span>{language.t("store.browse.admin")}</span>
          </button>

          {/* User avatar */}
          <div class="size-8 overflow-hidden rounded-full bg-[var(--native-surface)]">
            <Show
              when={auth.user()?.avatarUrl}
              fallback={
                <div class="flex size-full items-center justify-center text-sm font-medium text-[var(--native-muted)]">
                  {auth.user()?.name?.[0]?.toUpperCase() ?? "U"}
                </div>
              }
            >
              <img src={auth.user()!.avatarUrl} alt={auth.user()!.name} class="size-full object-cover" />
            </Show>
          </div>
        </Show>
      </div>
    </nav>
  )
}
