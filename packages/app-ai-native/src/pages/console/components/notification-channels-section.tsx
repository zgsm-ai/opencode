import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import QRCode from "qrcode"
import { useLanguage } from "@/context/language"
import { channelApi, type ChannelConfig } from "@/pages/store/lib/api"
import { Button } from "@/components/ui/button"
import { channelService } from "../lib/channel-service"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import { listIdentities, startBind } from "../lib/identity-api"

type TD = {
  id: string
  name: string
  desc: string
}

const TYPE_MAP: Record<string, { id: string; nameKey: string; descKey: string }> = {
  "wecom": { id: "wecom-app", nameKey: "console.wecomApp.title", descKey: "console.wecomApp.typeDescription" },
  "wecom-bot": { id: "wecom-bot", nameKey: "channels.type.wecom-bot", descKey: "channels.description" },
}

export function NotificationChannelsSection() {
  const dialog = useDialog()
  const language = useLanguage()

  const [availableTypes] = createResource(async () => channelService.getAvailableTypes())
  const [allChannels, chActs] = createResource(async () => channelApi.list())

  const [identities] = createResource(async () => (await listIdentities()) ?? [])
  const hasIdTrust = () => (identities() ?? []).some(i => i.provider === "idtrust")

  const channelsByType = (typeId: string) =>
    (allChannels() ?? []).filter(ch => ch.channelType === typeId)

  const typeDisplays = () => {
    const types = availableTypes()?.channelTypes ?? []
    return types.map(t => {
      const display = TYPE_MAP[t.type]
      if (display) return { id: display.id, name: language.t(display.nameKey), desc: language.t(display.descKey) }
      return { id: t.type, name: t.type, desc: "" }
    })
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    const current = allChannels() ?? []
    const target = current.find(ch => ch.id === id)
    if (!target) return

    const optimistic: ChannelConfig = { ...target, enabled }
    chActs.mutate(list => (list ?? []).map(ch => ch.id === id ? optimistic : ch))

    try {
      await channelApi.update(id, { enabled })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: enabled ? language.t("store.notificationChannels.enabled") : language.t("store.notificationChannels.disabled"),
      })
    } catch (error) {
      chActs.mutate(() => current)
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleRemove = (id: string) => {
    const target = allChannels()?.find(ch => ch.id === id)
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("common.delete")}
        description={`${language.t("common.confirm")}删除「${target?.name ?? ""}」?`}
        onConfirm={async () => {
          const current = allChannels() ?? []
          chActs.mutate(list => (list ?? []).filter(ch => ch.id !== id))
          try {
            await channelApi.remove(id)
            showToast({
              variant: "success",
              icon: "circle-check",
              title: language.t("channels.toast.deleted"),
            })
          } catch (error) {
            chActs.mutate(() => current)
            showToast({
              variant: "error",
              icon: "circle-x",
              title: language.t("common.requestFailed"),
              description: error instanceof Error ? error.message : String(error),
            })
          }
        }}
      />
    ))
  }

  const refreshChannels = () => chActs.refetch()

  const isLoading = () => availableTypes.loading || allChannels.loading

  return (
    <section class="rounded-[1.25rem] border border-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_84%,var(--native-bg-subtle))] p-3 shadow-[var(--native-shadow-sm)] sm:p-4">
      <div class="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 class="m-0 font-[var(--native-font-display)] text-[0.9875rem] font-semibold tracking-[-0.03em] text-[var(--native-foreground)]">
            {language.t("console.notificationChannels.title")}
          </h2>
          <p class="mt-0.5 max-w-[62ch] text-[0.8125rem] leading-[1.55] text-[var(--native-muted)]">
            {language.t("console.notificationChannels.description")}
          </p>
        </div>
      </div>

      <Show
        when={!isLoading()}
        fallback={<div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] px-6 py-8 text-center text-[0.8125rem] text-[var(--native-muted)] sm:px-8 sm:py-10">{language.t("console.notificationChannels.loading")}</div>}
      >
        <Show
          when={typeDisplays().length > 0}
          fallback={
            <div class="rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] px-6 py-8 text-center text-[0.8125rem] text-[var(--native-muted)] sm:px-8 sm:py-10">
              <div class="flex flex-col items-center gap-3">
                <div class="font-medium text-[var(--native-fg)]">{language.t("console.notificationChannels.noChannels.title")}</div>
                <div class="text-[var(--native-muted)]">{language.t("console.notificationChannels.noChannels.description")}</div>
              </div>
            </div>
          }
        >
          <div class="flex flex-col gap-6">
            <For each={typeDisplays()}>
              {(td) => (
                <ChannelTypeSection
                  td={td}
                  channels={channelsByType(td.id === "wecom-app" ? "wecom" : td.id)}
                  hasIdTrust={hasIdTrust()}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  onRefresh={refreshChannels}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}

type ChannelTypeSectionProps = {
  td: TD
  channels: ChannelConfig[]
  hasIdTrust: boolean
  onToggle: (id: string, enabled: boolean) => Promise<void>
  onRemove: (id: string) => void
  onRefresh: () => void
}

function ChannelTypeSection(props: ChannelTypeSectionProps) {
  const language = useLanguage()
  const dialog = useDialog()
  const needsIdTrust = () => props.td.id === "wecom-app" || props.td.id === "wecom-bot"
  const available = () => !needsIdTrust() || props.hasIdTrust
  const [toggling, setToggling] = createSignal(false)
  const [testing, setTesting] = createSignal(false)
  const first = () => props.channels[0]

  const isWecomBot = () => props.td.id === "wecom-bot"
  const isBound = () => isWecomBot() && !!first()?.webhookVerified
  const isBinding = () => isWecomBot() && !!first()?.enabled && !first()?.webhookVerified

  // Poll channel list while waiting for the user's first message so the UI flips
  // to "bound" automatically once the proxy/server handshake completes.
  createEffect(() => {
    if (!isBinding()) return
    const id = first()?.id
    if (!id) return
    const timer = setInterval(() => props.onRefresh(), 5000)
    onCleanup(() => clearInterval(timer))
  })

  const handleToggle = async () => {
    const ch = first()
    if (!ch) return
    setToggling(true)
    try {
      await props.onToggle(ch.id, !ch.enabled)
    } finally {
      setToggling(false)
    }
  }

  const handleTest = async () => {
    const ch = first()
    if (!ch) return
    setTesting(true)
    try {
      await channelApi.test(ch.id)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("channels.wecomBot.testSent"),
      })
    } catch (error) {
      showToast({
        variant: "error",
        icon: "circle-x",
        title: language.t("channels.toast.testFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setTesting(false)
    }
  }

  const statusBadge = () => {
    const ch = first()
    if (!ch) return null
    if (!ch.enabled) {
      return (
        <span
          class="ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ background: "color-mix(in srgb, #ef4444 12%, transparent)", color: "#ef4444" }}
        >
          {language.t("channels.disabled")}
        </span>
      )
    }
    if (isWecomBot()) {
      if (isBound()) {
        return (
          <span
            class="ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: "color-mix(in srgb, #22c55e 12%, transparent)", color: "#22c55e" }}
          >
            {language.t("channels.wecomBot.bound")}
          </span>
        )
      }
      return (
        <span
          class="ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ background: "color-mix(in srgb, #f59e0b 14%, transparent)", color: "#f59e0b" }}
        >
          {language.t("channels.wecomBot.unbound")}
        </span>
      )
    }
    return (
      <span
        class="ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium"
        style={{ background: "color-mix(in srgb, #22c55e 12%, transparent)", color: "#22c55e" }}
      >
        {language.t("channels.enabled")}
      </span>
    )
  }

  return (
    <div class="rounded-lg border border-[color:color-mix(in_oklab,var(--native-border)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,var(--native-bg-subtle))] p-4">
      {/* Type Header */}
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)]">
            <svg class="h-6 w-6" viewBox="0 0 1228 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" style="color: var(--native-primary)">
              <path fill="currentColor" d="M1045.84 747.027a153.563 153.563 0 0 0-53.156 21.515 129.094 129.094 0 0 1-58.092 35.1c2.953-19.828 12.783-37.926 27.633-51.3a191.186 191.186 0 0 0 26.452-62.142 56.953 56.953 0 1 1 57.164 56.827zM941.639 610.634a190.814 190.814 0 0 0-61.932-26.747 56.953 56.953 0 1 1 56.953-56.953 155.266 155.266 0 0 0 21.263 53.325 129.666 129.666 0 0 1 34.762 58.346 85.978 85.978 0 0 1-50.878-27.97h-0.21z m-93.826-200.728c-17.17-143.817-166.092-256.5-346.274-256.5-191.954 0-348.132 127.744-348.132 284.85a266.33 266.33 0 0 0 124.369 216.169 351.762 351.762 0 0 0 37.969 24.384l-15.44 61.636c5.568 2.616 10.968 5.4 16.663 7.805l77.963-38.981c11.39 2.953 23.372 4.851 35.268 6.876 7.594 1.35 15.188 2.742 22.993 3.67a401.119 401.119 0 0 0 145.547-8.353 281.011 281.011 0 0 0 11.474 62.185 481.153 481.153 0 0 1-108.675 12.698 472.5 472.5 0 0 1-97.621-10.758L262.46 846.21a31.219 31.219 0 0 1-33.877-3.543 31.64 31.64 0 0 1-10.926-32.316l25.312-101.925A330.075 330.075 0 0 1 90.125 438.256c0-192.29 184.19-348.131 411.413-348.131 215.746 0 392.428 140.653 409.64 319.444a276.919 276.919 0 0 0-29.91-2.953c-11.18 0.422-22.36 1.476-33.456 3.248zM716.399 634.47c18.943-3.797 36.957-11.053 53.157-21.515a129.094 129.094 0 0 1 58.134-35.016 86.358 86.358 0 0 1-27.675 51.216c-12.445 18.984-21.389 40.078-26.451 62.184a56.953 56.953 0 1 1-57.165-56.869z m102.6 137.025c18.816 12.614 39.741 21.727 61.763 27a56.953 56.953 0 1 1-56.953 56.953 154.406 154.406 0 0 0-21.094-53.409 129.558 129.558 0 0 1-34.51-58.514 85.888 85.888 0 0 1 50.794 28.308v-0.338z"></path>
            </svg>
          </div>
          <div>
            <h3 class="m-0 font-[var(--native-font-display)] text-[1rem] font-semibold tracking-[-0.035em] text-[var(--native-foreground)]">
              {props.td.name}
              {statusBadge()}
            </h3>
            <p class="mt-0.5 text-[0.8125rem] text-[var(--native-muted)]">{props.td.desc}</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Show when={first()?.enabled && isBound()}>
            <Button
              variant="outline"
              size="sm"
              disabled={testing()}
              onClick={handleTest}
              class="bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] text-[var(--native-primary)] border-[color:color-mix(in_oklab,var(--native-primary)_20%,transparent)]"
            >
              {testing() ? language.t("common.saving") : language.t("channels.wecomBot.test")}
            </Button>
          </Show>
          <Show when={first() && available()}>
            <Button
              variant="outline"
              size="sm"
              disabled={toggling()}
              onClick={handleToggle}
              class={first()!.enabled
                ? "bg-[color:color-mix(in_srgb,#ef4444_8%,transparent)] text-[#ef4444] border-[color:color-mix(in_srgb,#ef4444_20%,transparent)]"
                : "bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] text-[var(--native-primary)] border-[color:color-mix(in_oklab,var(--native-primary)_20%,transparent)]"
              }
            >
              {toggling() ? language.t("common.saving") : (first()!.enabled ? language.t("channels.disable") : language.t("channels.enable"))}
            </Button>
          </Show>
        </div>
      </div>

      {/* IDTrust 警告 — wecom-app / wecom-bot 未绑定身份时引导 */}
      <Show when={needsIdTrust() && !props.hasIdTrust}>
        <div class="rounded-md border border-dashed border-[color:color-mix(in_srgb,#ef4444_20%,transparent)] bg-[color:color-mix(in_srgb,#ef4444_5%,transparent)] px-4 py-6 text-center">
          <div class="text-sm font-medium text-[#ef4444]">{language.t("console.wecomApp.unavailable.title")}</div>
          <div class="mt-2 text-xs text-[var(--native-muted)]">{language.t("console.wecomApp.unavailable.description")}</div>
          <div class="mt-3">
            <button
              type="button"
              class="rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-primary)_12%,var(--native-panel))] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_18%,var(--native-panel))]"
              onClick={async () => {
                try {
                  const authUrl = await startBind("idtrust")
                  window.location.href = authUrl
                } catch (error) {
                  showToast({ variant: "error", icon: "circle-x", title: language.t("console.wecomApp.bindFailed"), description: error instanceof Error ? error.message : String(error) })
                }
              }}
            >
              {language.t("console.wecomApp.bindButton")}
            </button>
          </div>
        </div>
      </Show>

      {/* wecom-bot 绑定引导/状态展示 */}
      <Show when={props.td.id === "wecom-bot" && first()?.enabled}>
        <Show
          when={isBound()}
          fallback={
            <WecomBotBindingFlow
              url={first()?.config?.botQRCode ?? ""}
              language={language}
            />
          }
        >
          <div class="mt-4 rounded-md border border-[color:color-mix(in_srgb,#22c55e_24%,transparent)] bg-[color:color-mix(in_srgb,#22c55e_6%,transparent)] px-4 py-3">
            <div class="text-[0.8125rem] font-medium text-[#16a34a]">{language.t("channels.wecomBot.boundHint")}</div>
          </div>
        </Show>
      </Show>

      {/* 错误信息 */}
      <Show when={props.channels.length === 0}>
        <div class="mt-4 rounded-md border border-dashed border-[color:color-mix(in_srgb,var(--native-border)_20%,transparent)] px-4 py-6 text-center text-sm text-[var(--native-muted)]">
          {language.t("channels.notConfigured")}
        </div>
      </Show>
      <For each={props.channels}>
        {(ch) => (
          <Show when={ch.lastError}>
            <div class="py-1 text-xs text-[#ef4444]">{ch.lastError}</div>
          </Show>
        )}
      </For>
    </div>
  )
}

function WecomBotBindingFlow(props: { url: string; language: ReturnType<typeof useLanguage> }) {
  const [dataUrl, setDataUrl] = createSignal("")

  createResource(() => props.url, async (url) => {
    if (!url) return
    try {
      const result = await QRCode.toDataURL(url, { width: 200, margin: 2 })
      setDataUrl(result)
    } catch {
      // ignore
    }
  })

  return (
    <div class="mt-4 rounded-md bg-[color:color-mix(in_srgb,#f59e0b_5%,transparent)] px-4 py-4">
      <div class="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
        <Show when={dataUrl()}>
          <img
            src={dataUrl()}
            alt="Bot QR Code"
            style={{ width: "140px", height: "140px", "object-fit": "contain" }}
          />
        </Show>
        <div class="flex flex-col gap-1.5">
          <div class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
            {props.language.t("channels.wecomBot.step1")}
          </div>
          <div class="text-[0.8125rem] text-[var(--native-muted)]">
            {props.language.t("channels.wecomBot.step2")}
          </div>
          <div class="text-[0.8125rem] text-[var(--native-muted)]">
            {props.language.t("channels.wecomBot.step3")}
          </div>
          <div class="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#f59e0b]">
            <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
            {props.language.t("channels.wecomBot.waitingBinding")}
          </div>
        </div>
      </div>
    </div>
  )
}
