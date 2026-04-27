import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import { createListCollection, SelectContent, SelectControl, SelectIndicator, SelectItem, SelectItemText, SelectList, SelectPositioner, SelectRoot, SelectTrigger, SelectValueText } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Back from "../components/back"
import { ChartCard } from "../components/charts/chart-card"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { MetricCard } from "../components/metric-card"
import { RatioPill } from "../components/ratio-pill"
import { getUserDetail, listUsers } from "../lib/api"
import { defaultWideRange, parseQueryRange, rangeQuery, searchQuery } from "../lib/date-range"
import { formatDuration, formatPercent } from "../lib/formatters"
import type { Granularity, UserDetailPeriodRow, UserOption } from "../lib/types"
import type { EChartsOption } from "echarts"
import { chart } from "../lib/chart-options"

function parseGranularity(value?: string): Granularity {
  if (value === "week" || value === "month" || value === "year") return value
  return "day"
}

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtTokens(up?: number, down?: number) {
  const total = (up ?? 0) + (down ?? 0)
  if (!total) return "-"
  if (total >= 1000000) return `${(total / 1000000).toFixed(1)}M`
  if (total >= 1000) return `${(total / 1000).toFixed(1)}K`
  return String(total)
}

function periodRange(row: UserDetailPeriodRow, granularity: Granularity) {
  const key = row.period_key?.trim() || row.period_label?.trim() || ""
  if (!key) return { start: "", end: "" }
  if (granularity === "day") return { start: key.replace(/-/g, ""), end: key.replace(/-/g, "") }
  if (granularity === "week") {
    const match = key.match(/^(\d{4})-W(\d{2})$/)
    if (!match) return { start: "", end: "" }
    const year = Number(match[1])
    const week = Number(match[2])
    const jan4 = new Date(year, 0, 4)
    const day = jan4.getDay() || 7
    const monday = new Date(jan4)
    monday.setDate(jan4.getDate() - day + 1 + (week - 1) * 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const start = `${monday.getFullYear()}${String(monday.getMonth() + 1).padStart(2, "0")}${String(monday.getDate()).padStart(2, "0")}`
    const end = `${sunday.getFullYear()}${String(sunday.getMonth() + 1).padStart(2, "0")}${String(sunday.getDate()).padStart(2, "0")}`
    return { start, end }
  }
  if (granularity === "month") {
    const [year, month] = key.split("-").map(Number)
    const last = new Date(year, month, 0).getDate()
    return {
      start: `${year}${String(month).padStart(2, "0")}01`,
      end: `${year}${String(month).padStart(2, "0")}${String(last).padStart(2, "0")}`,
    }
  }

  return { start: `${key}0101`, end: `${key}1231` }
}

function queryOf(range: [string, string], granularity: Granularity) {
  const next = rangeQuery(range)
  return searchQuery([
    ["startDate", next.startDate],
    ["endDate", next.endDate],
    ["granularity", granularity],
  ])
}

export default function KanbanUserDetail() {
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; granularity?: string }>()

  const userId = createMemo(() => decodeURIComponent(params.userId ?? "").trim())
  const dateRange = createMemo(() => parseQueryRange(search.startDate, search.endDate))
  const granularity = createMemo(() => parseGranularity(search.granularity))
  const [users] = createResource(
    () => true,
    async () => {
      try {
        return await listUsers()
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("kanban.loading.userList"),
          description: err instanceof Error ? err.message : String(err),
        })
        return [] as UserOption[]
      }
    },
  )

  const listHref = createMemo(() => {
    const q = queryOf(dateRange(), granularity())
    return `/kanban/user?${q.toString()}`
  })

  const detailHref = (id: string) => {
    const q = queryOf(dateRange(), granularity())
    return `/kanban/user/${encodeURIComponent(id)}?${q.toString()}`
  }

  const userItems = createMemo(() =>
    createListCollection({
      items: [
        { value: "", label: language.t("kanban.label.selectUser") },
        ...(users() ?? []).map((item) => ({
          value: item.user_id,
          label: item.user_name || item.user_id,
        })),
      ],
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
    }),
  )

  const granularityItems = createMemo(() =>
    createListCollection({
      items: [
        { value: "day" as const, label: language.t("kanban.granularity.day") },
        { value: "week" as const, label: language.t("kanban.granularity.week") },
        { value: "month" as const, label: language.t("kanban.granularity.month") },
        { value: "year" as const, label: language.t("kanban.granularity.year") },
      ],
      itemToValue: (item) => item.value,
      itemToString: (item) => item.label,
    }),
  )

  const [detail, { refetch }] = createResource(
    () => ({ userId: userId(), dateRange: dateRange(), granularity: granularity() }),
    async (input) => {
      if (!input.userId) return null
      try {
        return await getUserDetail(input)
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("kanban.loading.userDetail"),
          description: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    },
  )

  const [cachedDetail, setCachedDetail] = createSignal<{ key: string; data: NonNullable<Awaited<ReturnType<typeof getUserDetail>>> } | null>(null)

  createEffect(() => {
    const data = detail()
    if (!data) return
    setCachedDetail({ key: userId(), data })
  })

  const view = createMemo(() => {
    const data = detail()
    if (data) return data
    const cached = cachedDetail()
    if (cached?.key === userId()) return cached.data
    return null
  })

  const summary = createMemo(() => view()?.summary ?? {})
  const commits = createMemo(() => view()?.commits ?? [])
  const tasks = createMemo(() => view()?.tasks ?? [])
  const labels = createMemo(() => (commits().length ? commits() : tasks()).map((item) => item.period_label || item.period_key || "-"))
  const taskRatio = createMemo(() => summary().task_efficiency_ratio)
  const commitRatio = createMemo(() => summary().commit_efficiency_ratio)
  const userName = createMemo(() => summary().user_name?.trim() || "")

  const chart1 = createMemo<EChartsOption | undefined>(() => {
    if (!labels().length) return undefined
    return chart(`${language.t("kanban.table.taskCount")} / ${language.t("kanban.table.commitCount")}`, labels(), [
      { name: language.t("kanban.table.taskCount"), data: tasks().map((item) => Number(item.task_count ?? 0)) },
      { name: language.t("kanban.table.commitCount"), data: commits().map((item) => Number(item.commit_count ?? 0)) },
    ], { titleSize: 14 })
  })

  const chart2 = createMemo<EChartsOption | undefined>(() => {
    if (!labels().length) return undefined
    return chart(language.t("kanban.metric.codeLines"), labels(), [
      { name: `Task ${language.t("kanban.metric.codeLines")}`, data: tasks().map((item) => Number(item.task_diff_lines ?? 0)) },
      { name: `Commit ${language.t("kanban.metric.codeLines")}`, data: commits().map((item) => Number(item.commit_diff_lines ?? 0)) },
    ], { titleSize: 14 })
  })

  const chart3 = createMemo<EChartsOption | undefined>(() => {
    if (!labels().length) return undefined
    return chart(language.t("kanban.table.timeComparison"), labels(), [
      { name: `Task ${language.t("kanban.table.traditionalEst")}`, data: tasks().map((item) => Number(item.task_ancient_minutes ?? 0)) },
      { name: `Task ${language.t("kanban.table.actualTime")}`, data: tasks().map((item) => Number(item.task_real_minutes ?? 0)) },
      { name: `Commit ${language.t("kanban.table.traditionalEst")}`, data: commits().map((item) => Number(item.commit_ancient_minutes ?? 0)) },
      { name: `Commit ${language.t("kanban.table.actualTime")}`, data: commits().map((item) => Number(item.commit_real_minutes ?? 0)) },
    ], { titleSize: 14, format: (value) => formatDuration(value, language.t) })
  })

  const chart4 = createMemo<EChartsOption | undefined>(() => {
    if (!labels().length) return undefined
    return chart(language.t("kanban.metric.cost"), labels(), [
      { name: language.t("kanban.metric.cost"), data: commits().map((item) => Number(item.cost ?? 0)) },
    ], { titleSize: 14, format: (value) => `${value.toFixed(2)} ${language.t("kanban.repo.yuan")}` })
  })

  const chart5 = createMemo<EChartsOption | undefined>(() => {
    if (!labels().length) return undefined
    return chart(language.t("kanban.chart.efficiencyRatio"), labels(), [
      { name: language.t("kanban.metric.taskEfficiency"), type: "line", data: tasks().map((item) => Number(item.task_efficiency_ratio ?? 0)) },
      { name: language.t("kanban.metric.commitEfficiency"), type: "line", data: commits().map((item) => Number(item.commit_efficiency_ratio ?? 0)) },
    ], { titleSize: 14, format: (value) => formatPercent(value) })
  })

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex flex-col gap-3">
          <Back href={listHref()} />

          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 class="font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.detail.user")}</h1>
            </div>

            <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-end">
              <label class="flex min-w-0 flex-col gap-2 md:min-w-[14rem]">
                <SelectRoot
                  collection={userItems()}
                  value={[userId()]}
                  onValueChange={(details) => {
                    const txt = details.value[0]
                    if (!txt || txt === userId()) return
                    navigate(detailHref(txt))
                  }}
                  positioning={{ sameWidth: true }}
                >
                  <SelectControl>
                    <SelectTrigger class="h-10 min-w-[14rem]">
                      <SelectValueText placeholder={language.t("kanban.label.selectUser")} />
                      <SelectIndicator />
                    </SelectTrigger>
                  </SelectControl>
                  <SelectPositioner>
                    <SelectContent>
                      <SelectList>
                        <For each={userItems().items}>
                          {(item) => (
                            <SelectItem item={item}>
                              <SelectItemText>{item.label}</SelectItemText>
                            </SelectItem>
                          )}
                        </For>
                      </SelectList>
                    </SelectContent>
                  </SelectPositioner>
                </SelectRoot>
              </label>

              <label class="flex min-w-0 flex-col gap-2">
                <DateRangePicker
                  value={dateRange()}
                  onChange={(value) => {
                    const next = value ?? defaultWideRange()
                    setSearch(Object.fromEntries(queryOf(next, granularity()).entries()))
                  }}
                  clearable={false}
                  placeholder={language.t("kanban.filter.selectDateRange")}
                />
              </label>

              <label class="flex min-w-0 flex-col gap-2">
                <SelectRoot
                  collection={granularityItems()}
                  value={[granularity()]}
                  onValueChange={(details) => {
                    const val = details.value[0]
                    if (val) {
                      setSearch(Object.fromEntries(queryOf(dateRange(), val as Granularity).entries()))
                    }
                  }}
                  positioning={{ sameWidth: true }}
                >
                  <SelectControl>
                    <SelectTrigger class="h-10 w-[6rem] min-w-[6rem] flex-none">
                      <SelectValueText />
                      <SelectIndicator />
                    </SelectTrigger>
                  </SelectControl>
                  <SelectPositioner>
                    <SelectContent>
                      <SelectList>
                        <SelectItem item={granularityItems().items[0]}>
                          <SelectItemText>{language.t("kanban.granularity.day")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[1]}>
                          <SelectItemText>{language.t("kanban.granularity.week")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[2]}>
                          <SelectItemText>{language.t("kanban.granularity.month")}</SelectItemText>
                        </SelectItem>
                        <SelectItem item={granularityItems().items[3]}>
                          <SelectItemText>{language.t("kanban.granularity.year")}</SelectItemText>
                        </SelectItem>
                      </SelectList>
                    </SelectContent>
                  </SelectPositioner>
                </SelectRoot>
              </label>

              <div class="flex items-end">
                <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={detail.loading}>{language.t("kanban.action.refresh")}</Button>
              </div>
            </div>
          </div>
        </header>

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label={language.t("kanban.metric.totalActiveDays")} value={String(summary().day_count ?? 0)} accent="var(--native-success)" />
          <MetricCard label={language.t("kanban.metric.totalTasks")} value={String(summary().task_count ?? 0)} accent="var(--native-warning)" />
          <MetricCard label={language.t("kanban.metric.totalCommits")} value={String(summary().commit_count ?? 0)} accent="var(--native-primary)" />
          <MetricCard label={language.t("kanban.metric.taskEfficiency")} value={formatPercent(taskRatio())} accent="var(--native-success)" />
          <MetricCard label={language.t("kanban.metric.commitEfficiency")} value={formatPercent(commitRatio())} accent="var(--native-primary)" />
          <MetricCard label={language.t("kanban.metric.totalCost")} value={fmtCost(summary().cost)} accent="var(--native-warning)" />
        </section>

        <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
          <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.commitList")}</div>
          <div class="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="min-w-[140px]">{language.t("kanban.table.time")}</TableHead>
                  <TableHead class="min-w-[90px] text-right">{language.t("kanban.table.taskCount")}</TableHead>
                  <TableHead class="min-w-[90px] text-right">{language.t("kanban.table.codeLines")}</TableHead>
                  <TableHead class="min-w-[110px] text-right">{language.t("kanban.table.actualTime")}</TableHead>
                  <TableHead class="min-w-[150px] text-right">{language.t("kanban.table.traditionalEst")}</TableHead>
                  <TableHead class="min-w-[100px] text-center">{language.t("kanban.table.efficiencyRatio")}</TableHead>
                  <TableHead class="min-w-[120px] text-right">{language.t("kanban.table.tokensConsumed")}</TableHead>
                  <TableHead class="min-w-[100px] text-right">{language.t("kanban.table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show when={commits().length > 0} fallback={<TableRow><TableCell colSpan={8} class="py-8 text-center text-sm text-[var(--native-muted)]">{language.t("kanban.empty.noCommitRecords")}</TableCell></TableRow>}>
                  <For each={commits()}>
                    {(row) => {
                      const link = () => {
                        const span = periodRange(row, granularity())
                        const q = new URLSearchParams()
                        if (span.start && span.end) {
                          q.set("startDate", span.start)
                          q.set("endDate", span.end)
                        }
                        if (userName()) q.set("userName", userName())
                        return `/kanban/task?${q.toString()}`
                      }

                      return (
                        <TableRow>
                          <TableCell>{row.period_label || row.period_key || "-"}</TableCell>
                          <TableCell class="text-right tabular-nums">{(row.task_count ?? 0) > 0 ? <button type="button" class="text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(link())}>{row.task_count}</button> : 0}</TableCell>
                          <TableCell class="text-right tabular-nums">{row.commit_diff_lines ?? 0}</TableCell>
                          <TableCell class="text-right">{formatDuration(row.commit_real_minutes, language.t)}</TableCell>
                          <TableCell class="text-right">{formatDuration(row.commit_ancient_minutes, language.t)}</TableCell>
                          <TableCell class="text-center"><RatioPill value={row.commit_efficiency_ratio} /></TableCell>
                          <TableCell class="text-right tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell>
                          <TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell>
                        </TableRow>
                      )
                    }}
                  </For>
                </Show>
              </TableBody>
            </Table>
          </div>
        </section>

        <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
          <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.taskList")}</div>
          <div class="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="min-w-[140px]">{language.t("kanban.table.time")}</TableHead>
                  <TableHead class="min-w-[90px] text-right">{language.t("kanban.table.commitCount")}</TableHead>
                  <TableHead class="min-w-[90px] text-right">{language.t("kanban.table.codeLines")}</TableHead>
                  <TableHead class="min-w-[110px] text-right">{language.t("kanban.table.actualTime")}</TableHead>
                  <TableHead class="min-w-[150px] text-right">{language.t("kanban.table.traditionalEst")}</TableHead>
                  <TableHead class="min-w-[100px] text-center">{language.t("kanban.table.efficiencyRatio")}</TableHead>
                  <TableHead class="min-w-[120px] text-right">{language.t("kanban.table.tokensConsumed")}</TableHead>
                  <TableHead class="min-w-[100px] text-right">{language.t("kanban.table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show when={tasks().length > 0} fallback={<TableRow><TableCell colSpan={8} class="py-8 text-center text-sm text-[var(--native-muted)]">{language.t("kanban.empty.noTaskRecords")}</TableCell></TableRow>}>
                  <For each={tasks()}>
                    {(row) => {
                      const link = () => {
                        const span = periodRange(row, granularity())
                        const q = new URLSearchParams()
                        if (span.start && span.end) {
                          q.set("startDate", span.start)
                          q.set("endDate", span.end)
                        }
                        if (userName()) q.set("userName", userName())
                        return `/kanban/commit?${q.toString()}`
                      }

                      return (
                        <TableRow>
                          <TableCell>{row.period_label || row.period_key || "-"}</TableCell>
                          <TableCell class="text-right tabular-nums">{(row.commit_count ?? 0) > 0 ? <button type="button" class="text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(link())}>{row.commit_count}</button> : 0}</TableCell>
                          <TableCell class="text-right tabular-nums">{row.task_diff_lines ?? 0}</TableCell>
                          <TableCell class="text-right">{formatDuration(row.task_real_minutes, language.t)}</TableCell>
                          <TableCell class="text-right">{formatDuration(row.task_ancient_minutes, language.t)}</TableCell>
                          <TableCell class="text-center"><RatioPill value={row.task_efficiency_ratio} /></TableCell>
                          <TableCell class="text-right tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell>
                          <TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell>
                        </TableRow>
                      )
                    }}
                  </For>
                </Show>
              </TableBody>
            </Table>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <ChartCard option={chart1()} empty={language.t("kanban.chart.empty.count")} />
          <ChartCard option={chart2()} empty={language.t("kanban.chart.empty.code")} />
          <ChartCard option={chart3()} empty={language.t("kanban.chart.empty.time")} />
          <ChartCard option={chart4()} empty={language.t("kanban.chart.empty.cost")} />
        </section>

        <ChartCard option={chart5()} empty={language.t("kanban.chart.empty.ratio")} />
      </div>
    </div>
  )
}