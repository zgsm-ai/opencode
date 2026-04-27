import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Back from "../components/back"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { MetricCard } from "../components/metric-card"
import { RatioPill } from "../components/ratio-pill"
import { defaultWideRange, parseQueryRange, rangeQuery, searchQuery } from "../lib/date-range"
import { formatPercent } from "../lib/formatters"
import { deleteUserGroup, getUserGroupDetail } from "../lib/api"

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function KanbanUserGroupDetail() {
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string }>()

  const groupId = createMemo(() => decodeURIComponent(params.groupId ?? "").trim())
  const dateRange = createMemo(() => parseQueryRange(search.startDate, search.endDate))
  const routeQuery = createMemo(() => searchQuery([
    ["startDate", search.startDate],
    ["endDate", search.endDate],
  ]).toString())
  const listHref = createMemo(() => routeQuery() ? `/kanban/user?${routeQuery()}` : "/kanban/user")

  createEffect(() => {
    const next = rangeQuery(dateRange())
    const mirror = searchQuery([
      ["startDate", next.startDate],
      ["endDate", next.endDate],
    ])
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
    ])
    if (mirror.toString() !== current.toString()) setSearch(Object.fromEntries(mirror.entries()))
  })

  const [data, { refetch }] = createResource(
    () => ({ groupId: groupId(), dateRange: dateRange() as [string, string] }),
    async (input) => {
      if (!input.groupId) return null
      try {
        return await getUserGroupDetail(input)
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("kanban.loading.userGroupDetail"),
          description: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    },
  )

  const [cachedDetail, setCachedDetail] = createSignal<{ key: string; data: NonNullable<Awaited<ReturnType<typeof getUserGroupDetail>>> } | null>(null)

  createEffect(() => {
    const next = data()
    if (!next) return
    setCachedDetail({ key: groupId(), data: next })
  })

  const view = createMemo(() => {
    const next = data()
    if (next) return next
    const cached = cachedDetail()
    if (cached?.key === groupId()) return cached.data
    return null
  })

  const drop = async () => {
    if (!groupId()) return
    if (!window.confirm(language.t("kanban.confirm.deleteVirtualGroup"))) return

    try {
      await deleteUserGroup(groupId())
      showToast({ variant: "success", title: language.t("kanban.toast.deleteSuccess") })
      navigate("/kanban/user")
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("kanban.toast.deleteFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const detail = createMemo(() => view())
  const group = createMemo(() => detail()?.group ?? {})
  const summary = createMemo(() => detail()?.summary ?? {})
  const members = createMemo(() => detail()?.members ?? [])
  const taskRatio = createMemo(() => summary().task_efficiency_ratio)
  const commitRatio = createMemo(() => summary().commit_efficiency_ratio)

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-4 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="mx-auto flex w-full max-w-[1320px] flex-col gap-5">
        <header class="flex flex-col gap-3">
          <Back href={listHref()} />

          <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--native-success)]">{language.t("kanban.breadcrumb.userGroup")}</p>
                <h1 class="mt-2 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{language.t("kanban.label.virtualGroup")}: {group().name || groupId() || "-"}</h1>
              </div>

              <div class="flex flex-col gap-3 md:flex-row md:items-end">
                <label class="flex min-w-0 flex-col gap-2">
                  <DateRangePicker
                    value={dateRange()}
                    onChange={(value) => {
                      const next = value ?? defaultWideRange()
                      setSearch(Object.fromEntries(searchQuery([
                        ["startDate", rangeQuery(next).startDate],
                        ["endDate", rangeQuery(next).endDate],
                      ]).entries()))
                    }}
                    clearable={false}
                    placeholder={language.t("kanban.filter.selectDateRange")}
                    fullWidth={false}
                  />
                </label>

                <div class="flex items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>{language.t("kanban.action.refresh")}</Button>
                  <Button variant="destructive" size="sm" onClick={() => void drop()} disabled={data.loading}>{language.t("kanban.label.deleteGroup")}</Button>
                </div>
              </div>
            </div>
          </section>
        </header>

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label={language.t("kanban.metric.memberCount")} value={String(members().length)} accent="var(--native-success)" />
          <MetricCard label={language.t("kanban.metric.totalTasks")} value={String(summary().task_count ?? 0)} accent="var(--native-warning)" />
          <MetricCard label={language.t("kanban.metric.totalCommits")} value={String(summary().commit_count ?? 0)} accent="var(--native-primary)" />
          <MetricCard label={language.t("kanban.metric.weightedTaskEfficiency")} value={formatPercent(taskRatio())} accent="var(--native-success)" />
          <MetricCard label={language.t("kanban.metric.weightedCommitEfficiency")} value={formatPercent(commitRatio())} accent="var(--native-primary)" />
          <MetricCard label={language.t("kanban.metric.totalCost")} value={fmtCost(summary().cost)} accent="var(--native-warning)" />
        </section>

        <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
          <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">{language.t("kanban.section.participantList")}</div>
          <div class="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="min-w-[150px]">{language.t("kanban.table.userName")}</TableHead>
                  <TableHead class="min-w-[100px] text-right">{language.t("kanban.label.activeDays")}</TableHead>
                  <TableHead class="min-w-[90px] text-right">{language.t("kanban.table.taskCount")}</TableHead>
                  <TableHead class="min-w-[100px] text-right">{language.t("kanban.table.commitCount")}</TableHead>
                  <TableHead class="min-w-[110px] text-center">{language.t("kanban.table.taskEfficiency")}</TableHead>
                  <TableHead class="min-w-[120px] text-center">{language.t("kanban.table.commitEfficiency")}</TableHead>
                  <TableHead class="min-w-[100px] text-right">{language.t("kanban.table.cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={members()}>
                  {(row) => (
                    <TableRow class="cursor-pointer" onClick={() => {
                      const txt = row.user_id?.trim()
                      if (!txt) return
                      navigate(`/kanban/user/${encodeURIComponent(txt)}?${routeQuery()}`)
                    }}>
                      <TableCell>{row.user_name || row.user_id || "-"}</TableCell>
                      <TableCell class="text-right tabular-nums">{row.day_count ?? "-"}</TableCell>
                      <TableCell class="text-right tabular-nums">{row.task_count ?? "-"}</TableCell>
                      <TableCell class="text-right tabular-nums">{row.commit_count ?? "-"}</TableCell>
                      <TableCell class="text-center"><RatioPill value={row.task_efficiency_ratio} /></TableCell>
                      <TableCell class="text-center"><RatioPill value={row.commit_efficiency_ratio} /></TableCell>
                      <TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  )
}
