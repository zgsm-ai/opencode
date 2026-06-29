import { createEffect, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { getLoginUrl } from "@/pages/store/lib/auth"
import { Button } from "@/components/ui/button"
import { sx } from "@/pages/store/lib/styles"
import { listIdentities, unbindIdentity, startBind, confirmMerge, cancelMerge, type AuthIdentity } from "./lib/identity-api"
import { cn } from "@/lib/utils"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"

const PROVIDER_SVG: Record<string, string> = {
  idtrust: `<svg viewBox="0 0 1228 1024" fill="white" width="24" height="24"><path d="M1045.84 747.027a153.563 153.563 0 0 0-53.156 21.515 129.094 129.094 0 0 1-58.092 35.1c2.953-19.828 12.783-37.926 27.633-51.3a191.186 191.186 0 0 0 26.452-62.142 56.953 56.953 0 1 1 57.164 56.827zM941.639 610.634a190.814 190.814 0 0 0-61.932-26.747 56.953 56.953 0 1 1 56.953-56.953 155.266 155.266 0 0 0 21.263 53.325 129.666 129.666 0 0 1 34.762 58.346 85.978 85.978 0 0 1-50.878-27.97h-0.21z m-93.826-200.728c-17.17-143.817-166.092-256.5-346.274-256.5-191.954 0-348.132 127.744-348.132 284.85a266.33 266.33 0 0 0 124.369 216.169 351.762 351.762 0 0 0 37.969 24.384l-15.44 61.636c5.568 2.616 10.968 5.4 16.663 7.805l77.963-38.981c11.39 2.953 23.372 4.851 35.268 6.876 7.594 1.35 15.188 2.742 22.993 3.67a401.119 401.119 0 0 0 145.547-8.353 281.011 281.011 0 0 0 11.474 62.185 481.153 481.153 0 0 1-108.675 12.698 472.5 472.5 0 0 1-97.621-10.758L262.46 846.21a31.219 31.219 0 0 1-33.877-3.543 31.64 31.64 0 0 1-10.926-32.316l25.312-101.925A330.075 330.075 0 0 1 90.125 438.256c0-192.29 184.19-348.131 411.413-348.131 215.746 0 392.428 140.653 409.64 319.444a276.919 276.919 0 0 0-29.91-2.953c-11.18 0.422-22.36 1.476-33.456 3.248zM716.399 634.47c18.943-3.797 36.957-11.053 53.157-21.515a129.094 129.094 0 0 1 58.134-35.016 86.358 86.358 0 0 1-27.675 51.216c-12.445 18.984-21.389 40.078-26.451 62.184a56.953 56.953 0 1 1-57.165-56.869z m102.6 137.025c18.816 12.614 39.741 21.727 61.763 27a56.953 56.953 0 1 1-56.953 56.953 154.406 154.406 0 0 0-21.094-53.409 129.558 129.558 0 0 1-34.51-58.514 85.888 85.888 0 0 1 50.794 28.308v-0.338z"></path></svg>`,
  github: `<svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14zm-4.2-5.78v1.75l3.2-2.99L12.8 9v1.7c-3.11.43-4.35 2.56-4.8 4.7 1.11-1.55 2.69-2.18 4.8-2.18z"/></svg>`,
}

const PROVIDER_META: Record<string, { labelKey: string; color: string }> = {
  idtrust: { labelKey: "console.identity.provider.idtrust", color: "#2563eb" },
  github: { labelKey: "console.identity.provider.github", color: "#24292f" },
  phone: { labelKey: "console.identity.provider.phone", color: "#16a34a" },
  casdoor: { labelKey: "console.identity.provider.casdoor", color: "#7c3aed" },
}

const ALL_PROVIDERS = ["idtrust", "github", "phone"] as const

export default function IdentityPage() {
  const language = useLanguage()
  const { user, loading: authLoading, logout, refreshUser } = useAuth()
  const dialog = useDialog()

  const [identities, setIdentities] = createSignal<AuthIdentity[]>([])
  const [loadingIdentities, setLoadingIdentities] = createSignal(false)
  const [unbindingProvider, setUnbindingProvider] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [bindSuccess, setBindSuccess] = createSignal(false)
  const [mergeToken, setMergeToken] = createSignal<string | null>(null)
  const [mergeProvider, setMergeProvider] = createSignal<string | null>(null)
  const [merging, setMerging] = createSignal(false)
  const [mismatchExpected, setMismatchExpected] = createSignal<string | null>(null)
  const [mismatchActual, setMismatchActual] = createSignal<string | null>(null)

  const fetchIdentities = async () => {
    setLoadingIdentities(true)
    setError(null)
    try {
      const list = await listIdentities()
      setIdentities(list)
    } catch (err: any) {
      setError(err.message || "Failed to load identities")
    } finally {
      setLoadingIdentities(false)
    }
  }

  const handleUnbind = (identity: AuthIdentity) => {
    if (visibleIdentities().length <= 1) {
      setError(language.t("console.identity.errorCannotUnbindLast"))
      return
    }
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("console.identity.unbindConfirmTitle")}
        description={language.t("console.identity.unbindConfirm")}
        confirm={language.t("console.identity.unbind")}
        onConfirm={async () => {
          setUnbindingProvider(identity.provider)
          try {
            const result = await unbindIdentity(identity.provider)
            if (result.requireRelogin) {
              await logout()
              return
            }
            await Promise.all([fetchIdentities(), refreshUser()])
          } catch (err: any) {
            setError(err.message || "Failed to unbind")
          } finally {
            setUnbindingProvider(null)
          }
        }}
      />
    ))
  }

  const handleBind = async (provider: string) => {
    setError(null)
    try {
      const authUrl = await startBind(provider)
      window.location.href = authUrl
    } catch (err: any) {
      setError(err.message || "Failed to start binding")
    }
  }

  const labelKeyForProvider = (provider: string) => {
    const meta = PROVIDER_META[provider.toLowerCase()]
    return meta ? language.t(meta.labelKey) : provider
  }

  const handleMergeConfirm = async () => {
    const token = mergeToken()
    if (!token) return
    setMerging(true)
    try {
      await confirmMerge(token)
      window.history.replaceState({}, "", window.location.pathname)
      setMergeToken(null)
      setMergeProvider(null)
      setBindSuccess(true)
      setTimeout(() => setBindSuccess(false), 5000)
      await Promise.all([fetchIdentities(), refreshUser()])
    } catch (err: any) {
      setError(err.message || "Failed to merge accounts")
    } finally {
      setMerging(false)
    }
  }

  const handleMergeCancel = async () => {
    const token = mergeToken()
    if (token) {
      try {
        await cancelMerge(token)
      } catch { /* ignore */ }
    }
    window.history.replaceState({}, "", window.location.pathname)
    setMergeToken(null)
    setMergeProvider(null)
  }

  createEffect(() => {
    if (user()) fetchIdentities()
  })

  createEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const bind = params.get("bind")
    if (bind === "success") {
      setBindSuccess(true)
      window.history.replaceState({}, "", window.location.pathname)
      setTimeout(() => setBindSuccess(false), 5000)
      fetchIdentities()
      refreshUser()
    } else if (bind === "conflict") {
      const token = params.get("merge_token")
      if (token) {
        const payload = token.split(".")[0]
        try {
          const decoded = JSON.parse(atob(payload))
          setMergeProvider(decoded.provider || "unknown")
        } catch {
          setMergeProvider("unknown")
        }
        setMergeToken(token)
      }
    } else if (bind === "provider_mismatch") {
      setMismatchExpected(params.get("expected_provider"))
      setMismatchActual(params.get("actual_provider"))
      window.history.replaceState({}, "", window.location.pathname)
    }
  })

  const visibleIdentities = () => identities().filter((i) => ALL_PROVIDERS.includes(i.provider as any))
  const identityFor = (provider: string) => identities().find((i) => i.provider === provider)

  return (
    <Show when={!authLoading()} fallback={<div class={sx.empty}>{language.t("common.loading")}</div>}>
      <Show
        when={user()}
        fallback={
          <div class="flex min-h-[40vh] items-center justify-center">
            <div style={{ "text-align": "center" }}>
              <h1 class={sx.toolbarTitle}>{language.t("console.identity.title")}</h1>
              <p class="mb-3 text-[0.8125rem] text-[var(--native-muted)]">{language.t("console.identity.loginRequired")}</p>
              <Button type="button" size="sm" onClick={() => { window.location.href = getLoginUrl() }}>
                {language.t("store.console.login")}
              </Button>
            </div>
          </div>
        }
      >
        <section class={`${sx.section} pb-8`}>
          <div class={sx.toolbar}>
            <div>
              <h2 class={sx.toolbarTitle}>{language.t("console.identity.title")}</h2>
              <p class={cn(sx.toolbarSub, "max-w-none")}>{language.t("console.identity.description")}</p>
            </div>
          </div>

          <Show when={bindSuccess()}>
            <div class="mb-4 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,#16a34a_30%,transparent)] bg-[color:color-mix(in_oklab,#16a34a_8%,var(--native-panel))] px-4 py-3 text-[0.8125rem] text-[#16a34a]">
              {language.t("console.identity.bindSuccess")}
            </div>
          </Show>

          <Show when={mismatchExpected()}>
            <div class="mb-4 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,#d97706_30%,transparent)] bg-[color:color-mix(in_oklab,#d97706_8%,var(--native-panel))] px-4 py-3 text-[0.8125rem] text-[#d97706]">
              <p class="font-medium mb-1">{language.t("console.identity.providerMismatchTitle")}</p>
              <p>{language.t("console.identity.providerMismatchDescription", {
                expected: labelKeyForProvider(mismatchExpected() ?? ""),
                actual: labelKeyForProvider(mismatchActual() ?? ""),
              })}</p>
            </div>
          </Show>

          <Show when={error()}>
            <div class="mb-4 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,#ef4444_30%,transparent)] bg-[color:color-mix(in_oklab,#ef4444_8%,var(--native-panel))] px-4 py-3 text-[0.8125rem] text-[#ef4444]">
              {error()}
              <button class="ml-2 underline" onClick={() => setError(null)}>
                {language.t("console.identity.dismiss")}
              </button>
            </div>
          </Show>

          <Show when={mergeToken()}>
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div class="rounded-[var(--native-radius-md)] border bg-[var(--native-panel)] p-6 shadow-xl max-w-md mx-4">
                <h3 class="text-base font-medium mb-2">{language.t("console.identity.mergeTitle")}</h3>
                <p class="text-[0.8125rem] text-[var(--native-muted)] mb-4">
                  {language.t("console.identity.mergeDescription", { provider: labelKeyForProvider(mergeProvider() ?? "") })}
                </p>
                <div class="flex justify-end gap-2">
                  <button type="button"
                    class="rounded-[var(--native-radius-sm)] px-4 py-2 text-[0.8125rem] text-[var(--native-muted)] hover:bg-[var(--native-hover)] transition-colors"
                    onClick={handleMergeCancel}
                    disabled={merging()}>
                    {language.t("common.cancel")}
                  </button>
                  <Button type="button" size="sm" onClick={handleMergeConfirm} disabled={merging()}>
                    {merging() ? language.t("common.loading") : language.t("console.identity.mergeConfirm")}
                  </Button>
                </div>
              </div>
            </div>
          </Show>

          <div class={sx.cshell}>
            <Show when={!loadingIdentities()} fallback={<div class={sx.state}><div class={sx.spinner} /></div>}>
              <div class="flex flex-col gap-3">
                <For each={ALL_PROVIDERS}>
                  {(providerKey) => {
                    const meta = PROVIDER_META[providerKey]
                    const identity = () => identityFor(providerKey)
                    const isBound = () => identity() !== undefined

                    return (
                      <div class="flex items-center justify-between rounded-[var(--native-radius-md)] border px-4 py-3 transition-colors"
                        classList={{
                          "border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-[var(--native-panel)]": !isBound(),
                          "border-[color:color-mix(in_oklab,var(--native-primary)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_6%,var(--native-panel))]": isBound(),
                        }}
                      >
                        <div class="flex items-center gap-3">
                          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)]"
                            style={{ background: meta.color }}
                            innerHTML={PROVIDER_SVG[providerKey] ?? PROVIDER_SVG.idtrust}>
                          </div>
                          <div>
                            <span class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
                              {language.t(meta.labelKey)}
                            </span>
                          </div>
                        </div>

                        <Show when={isBound()} fallback={
                          <button type="button"
                            class="shrink-0 rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-primary)_12%,var(--native-panel))] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_18%,var(--native-panel))]"
                            onClick={() => handleBind(providerKey)}>
                            {language.t("console.identity.bind")}
                          </button>
                        }>
                          <Button type="button" variant="ghost" size="sm"
                            disabled={unbindingProvider() === identity()?.provider || visibleIdentities().length <= 1}
                            onClick={() => handleUnbind(identity()!)}
                            class="shrink-0 px-3 text-[0.8125rem] text-[var(--native-muted)] hover:text-[#ef4444]"
                            title={visibleIdentities().length <= 1 ? language.t("console.identity.errorCannotUnbindLast") : ""}>
                            <Show when={unbindingProvider() !== identity()?.provider} fallback={<div class={sx.spinner} />}>
                              {language.t("console.identity.unbind")}
                            </Show>
                          </Button>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </div>
        </section>
      </Show>
    </Show>
  )
}
