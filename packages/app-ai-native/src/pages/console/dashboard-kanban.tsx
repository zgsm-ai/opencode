import { createResource, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { kanbanApi } from "./lib/kanban-service"

export default function DashboardKanban() {
  const language = useLanguage()
  const [data] = createResource(async () => kanbanApi.overview())

  return (
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="font-[var(--native-font-display)] text-[1.25rem] font-semibold tracking-[-0.035em] text-[var(--native-foreground)]">
          {language.t("store.dashboard.nav.kanban")}
        </h1>
        <p class="mt-1 text-[0.8125rem] text-[var(--native-muted)]">
          {language.t("store.kanban.description")}
        </p>
      </div>

      <Show when={data()} fallback={<div class="text-[var(--native-muted)]">Loading...</div>}>
        {(metrics) => (
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label={language.t("store.kanban.totalProjects")} value={metrics().totalProjects} />
            <MetricCard label={language.t("store.kanban.totalUsers")} value={metrics().totalUsers} />
            <MetricCard label={language.t("store.kanban.totalDevices")} value={metrics().totalDevices} />
            <MetricCard label={language.t("store.kanban.onlineDevices")} value={metrics().onlineDevices} />
            <MetricCard label={language.t("store.kanban.totalRequests")} value={metrics().totalRequests} />
            <MetricCard label={language.t("store.kanban.activeUsers7d")} value={metrics().activeUsers7d} />
            <MetricCard label={language.t("store.kanban.inputTokens7d")} value={metrics().inputTokens7d} />
            <MetricCard label={language.t("store.kanban.outputTokens7d")} value={metrics().outputTokens7d} />
            <MetricCard label={language.t("store.kanban.cost7d")} value={metrics().cost7d} prefix="$" />
          </div>
        )}
      </Show>
    </div>
  )
}

function MetricCard(props: { label: string; value: number; prefix?: string }) {
  return (
    <div class="flex flex-col gap-1 rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_20%,transparent)] bg-[var(--native-panel)] p-4">
      <span class="text-[0.75rem] font-medium text-[var(--native-muted)]">{props.label}</span>
      <span class="font-[var(--native-font-display)] text-[1.5rem] font-semibold tracking-[-0.02em] text-[var(--native-foreground)]">
        {props.prefix ?? ""}{props.value}
      </span>
    </div>
  )
}
