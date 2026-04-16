import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, Show } from "solid-js"
import { channelApi, type ChannelConfig } from "../lib/api"
import { useLanguage } from "@/context/language"
import { ConfirmDialog } from "./confirm-dialog"
import { ConfigureChannelDialog } from "./configure-channel-dialog"

type Props = {
  channels?: () => ChannelConfig[] | undefined
  loading?: () => boolean
  setChannels?: (fn: (items: ChannelConfig[] | undefined) => ChannelConfig[] | undefined) => void
}

const TYPE_META: Record<string, { label: string; labelZh: string; icon: string }> = {
  wechat: { label: "WeChat", labelZh: "微信", icon: "smartphone" },
  wecom: { label: "WeCom", labelZh: "企业微信", icon: "building" },
}

export function ChannelsSection(props: Props = {}) {
  const dialog = useDialog()
  const language = useLanguage()

  const local = !props.channels
    ? createResource(async () => channelApi.list())
    : undefined
  const [available] = createResource(() => channelApi.available())

  const channels = () => props.channels?.() ?? local?.[0]()
  const loading = () => props.loading?.() ?? local?.[0].loading ?? false
  const mutate = props.setChannels ?? local?.[1].mutate ?? (() => undefined)

  const types = () => available()?.channelTypes ?? []

  const configByType = createMemo(() => {
    const map: Record<string, ChannelConfig> = {}
    for (const ch of channels() ?? []) {
      map[ch.channelType] = ch
    }
    return map
  })

  const handleConfigure = (type: string) => {
    const existing = configByType()[type]
    dialog.show(() => (
      <ConfigureChannelDialog
        channelType={type}
        existing={existing}
        onSaved={async (payload) => {
          if (existing) {
            const res = await channelApi.update(existing.id, payload)
            mutate((list) => (list ?? []).map((c) => (c.id === existing.id ? res.channel : c)))
          } else {
            const res = await channelApi.create(payload as { channelType: string; name: string; config: Record<string, string> })
            mutate((list) => [res.channel, ...(list ?? [])])
          }
          showToast({ variant: "success", icon: "circle-check", title: language.t("channels.toast.saved") })
        }}
      />
    ))
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    const current = channels() ?? []
    mutate((list) => (list ?? []).map((c) => (c.id === id ? { ...c, enabled } : c)))
    try {
      await channelApi.update(id, { enabled })
    } catch {
      mutate(() => current)
    }
  }

  const handleTest = async (id: string) => {
    try {
      await channelApi.test(id)
      showToast({ variant: "success", icon: "circle-check", title: language.t("channels.toast.testSent") })
    } catch (e) {
      showToast({ variant: "error", icon: "circle-x", title: language.t("channels.toast.testFailed"), description: e instanceof Error ? e.message : String(e) })
    }
  }

  const handleRemove = (id: string) => {
    const target = (channels() ?? []).find((c) => c.id === id)
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("common.delete")}
        description={language.t("channels.confirmDelete", { name: target?.name ?? "" })}
        onConfirm={async () => {
          const current = channels() ?? []
          mutate((list) => (list ?? []).filter((c) => c.id !== id))
          try {
            await channelApi.remove(id)
            showToast({ variant: "success", icon: "circle-check", title: language.t("channels.toast.deleted") })
          } catch (e) {
            mutate(() => current)
            showToast({ variant: "error", icon: "circle-x", title: language.t("channels.toast.deleteFailed") })
          }
        }}
      />
    ))
  }

  return (
    <section class="store-cshell">
      <div class="store-tbar">
        <div>
          <h2 class="store-tbar-title">{language.t("channels.title")}</h2>
          <p class="store-tbar-sub">{language.t("channels.description")}</p>
        </div>
      </div>

      <Show
        when={!loading()}
        fallback={<div class="store-dash-empty">{language.t("channels.loading")}</div>}
      >
        <Show
          when={types().length > 0}
          fallback={<div class="store-dash-empty">{language.t("channels.empty")}</div>}
        >
          <div class="store-dash-grid store-dash-grid-3">
            <For each={types()}>
              {(t) => {
                const cfg = () => configByType()[t.type]
                const meta = TYPE_META[t.type] ?? { label: t.type, labelZh: t.type, icon: "comment" }
                return (
                  <div class="store-dash-card">
                    <div class="store-dash-card-head">
                      <span class="store-dash-card-name" style={{ display: "flex", "align-items": "center", gap: "0.375rem" }}>
                        <Icon name={meta.icon as any} size="small" />
                        {meta.label}
                      </span>
                      <Show when={cfg()}>
                        {(c) => (
                          <span
                            class="store-dash-pill"
                            style={{
                              background: c().enabled ? "color-mix(in srgb, #22c55e 12%, transparent)" : "rgba(156,163,175,0.12)",
                              color: c().enabled ? "#22c55e" : "var(--st-text-secondary)",
                            }}
                          >
                            {c().enabled ? language.t("channels.enabled") : language.t("channels.disabled")}
                          </span>
                        )}
                      </Show>
                      <Show when={!cfg()}>
                        <span class="store-dash-pill" style={{ background: "rgba(156,163,175,0.12)", color: "var(--st-text-secondary)" }}>
                          {language.t("channels.notConfigured")}
                        </span>
                      </Show>
                    </div>

                    <Show when={cfg()?.lastError}>
                      <div style={{ color: "#ef4444", "font-size": "12px", "margin-bottom": "0.25rem" }}>
                        {cfg()!.lastError}
                      </div>
                    </Show>

                    <div class="store-dash-card-foot" style={{ "justify-content": "space-between" }}>
                      <div style={{ display: "flex", gap: "0.25rem" }}>
                        <Show
                          when={cfg()}
                          fallback={
                            <button class="store-notif-test-btn" onClick={() => handleConfigure(t.type)}>
                              {language.t("channels.configure")}
                            </button>
                          }
                        >
                          {(c) => (
                            <>
                              <Show when={t.type !== "wechat"}>
                                <button
                                  class="store-notif-test-btn"
                                  disabled={!c().enabled}
                                  onClick={() => handleTest(c().id)}
                                >
                                  {language.t("channels.test")}
                                </button>
                              </Show>
                              <button class="store-notif-test-btn" onClick={() => handleToggle(c().id, !c().enabled)}>
                                {c().enabled ? language.t("channels.disable") : language.t("channels.enable")}
                              </button>
                            </>
                          )}
                        </Show>
                      </div>
                      <div style={{ display: "flex", gap: "2px" }}>
                        <Show when={cfg()}>
                          {(c) => (
                            <>
                              <button class="store-abtn" title={language.t("common.edit")} onClick={() => handleConfigure(t.type)}>
                                <Icon name="edit" size="small" />
                              </button>
                              <button class="store-abtn" title={language.t("common.delete")} onClick={() => handleRemove(c().id)}>
                                <Icon name="trash" size="small" />
                              </button>
                            </>
                          )}
                        </Show>
                      </div>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}
