import { createResource, createSignal, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Toast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { LocalIcon } from "@/components/local-icon"
import { DevicesSection } from "@/pages/store/components/devices-section"
import { NotificationChannelsSection } from "@/pages/store/components/notification-channels-section"
import { deviceManagementService } from "@/pages/store/lib/device-management-service"
import { notificationChannelService } from "@/pages/store/lib/notification-channel-service"
import "@/pages/store/store.css"
import "./console.css"

type Tab = "devices" | "notifications"

export default function ConsolePage() {
  const language = useLanguage()
  const [activeTab, setActiveTab] = createSignal<Tab>("devices")

  const [devices, deviceActs] = createResource(async () => deviceManagementService.list())
  const [channels, channelActs] = createResource(async () => notificationChannelService.listWecom())

  const onlineCount = () => (devices() ?? []).filter((d) => d.status === "online").length

  return (
    <>
      <div class="console-page">
        {/* Header */}
        <div class="console-header">
          <div class="console-header-icon">
            <Icon name="sliders" />
          </div>
          <div>
            <h1 class="console-header-title">{language.t("console.title")}</h1>
            <p class="console-header-desc">{language.t("console.description")}</p>
          </div>
        </div>

        {/* Stats */}
        <div class="console-stat-grid">
          <article
            class="store-stat-card"
            style={{ "--stat-accent": "#22c55e", "--stat-bg": "#D1FAE5" }}
            onClick={() => setActiveTab("devices")}
          >
            <div class="store-stat-card-icon">
              <Icon name="server" />
            </div>
            <div>
              <div class="store-stat-card-label">{language.t("console.stats.devices")}</div>
              <p class="store-stat-card-value">
                <Show when={!devices.loading} fallback="—">
                  {devices()?.length ?? 0}
                </Show>
              </p>
            </div>
          </article>

          <article
            class="store-stat-card"
            style={{ "--stat-accent": "#a855f7", "--stat-bg": "#EDE9FE" }}
            onClick={() => setActiveTab("notifications")}
          >
            <div class="store-stat-card-icon">
              <LocalIcon name="bell" size="small" />
            </div>
            <div>
              <div class="store-stat-card-label">{language.t("console.stats.channels")}</div>
              <p class="store-stat-card-value">
                <Show when={!channels.loading} fallback="—">
                  {channels()?.length ?? 0}
                </Show>
              </p>
            </div>
          </article>

          <article
            class="store-stat-card"
            style={{ "--stat-accent": "#3b82f6", "--stat-bg": "#DBEAFE" }}
          >
            <div class="store-stat-card-icon">
              <Icon name="circle-check" />
            </div>
            <div>
              <div class="store-stat-card-label">{language.t("console.stats.online")}</div>
              <p class="store-stat-card-value">
                <Show when={!devices.loading} fallback="—">
                  {onlineCount()}
                </Show>
              </p>
            </div>
          </article>
        </div>

        {/* Tabbed Content inside a card shell */}
        <section class="console-card">
          <div class="console-card-header">
            <div class="console-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab() === "devices"}
                class={`console-tab ${activeTab() === "devices" ? "console-tab-active" : ""}`}
                onClick={() => setActiveTab("devices")}
              >
                <Icon name="server" size="small" />
                {language.t("console.tab.devices")}
                <Show when={!devices.loading}>
                  <span class="console-tab-badge">{devices()?.length ?? 0}</span>
                </Show>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab() === "notifications"}
                class={`console-tab ${activeTab() === "notifications" ? "console-tab-active" : ""}`}
                onClick={() => setActiveTab("notifications")}
              >
                <LocalIcon name="bell" size="small" />
                {language.t("console.tab.notifications")}
                <Show when={!channels.loading}>
                  <span class="console-tab-badge">{channels()?.length ?? 0}</span>
                </Show>
              </button>
            </div>
          </div>

          <Show when={activeTab() === "devices"}>
            <div class="console-tab-panel">
              <DevicesSection
                devices={devices}
                loading={() => devices.loading}
                setDevices={deviceActs.mutate}
              />
            </div>
          </Show>
          <Show when={activeTab() === "notifications"}>
            <div class="console-tab-panel">
              <NotificationChannelsSection
                channels={channels}
                loading={() => channels.loading}
                setChannels={channelActs.mutate}
              />
            </div>
          </Show>
        </section>
      </div>
      <Toast.Region />
    </>
  )
}
