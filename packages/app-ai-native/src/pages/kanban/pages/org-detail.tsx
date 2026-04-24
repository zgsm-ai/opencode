import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import type { EChartsOption } from "echarts"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Back from "../components/back"
import { ChartCard } from "../components/charts/chart-card"
import { FilterBar } from "../components/filters/filter-bar"
import { MetricCard } from "../components/metric-card"
import { RatioPill } from "../components/ratio-pill"
import { chart } from "../lib/chart-options"
import { defaultWideRange, parseQueryRange, rangeQuery, searchQuery } from "../lib/date-range"
import { formatDuration, formatPercent } from "../lib/formatters"
import { getOrgDetail } from "../lib/api"
import type { Granularity, OrgCascadeValue } from "../lib/types"

function parseGranularity(value?: string): Granularity {
  if (value === "week" || value === "month" || value === "year") return value
  return "day"
}

function parsePath(path: string) {
  const txt = decodeURIComponent(path).trim()
  if (!txt || txt === "all") return {} as OrgCascadeValue
  const parts = txt.split("/").filter(Boolean)
  return {
    org1: parts[0],
    org2: parts[1],
    org3: parts[2],
    org4: parts[3],
  } satisfies OrgCascadeValue
}

function orgPath(value: OrgCascadeValue) {
  const parts = [value.org1, value.org2, value.org3, value.org4].filter(Boolean)
  return parts.length ? parts.join("/") : "all"
}

function parentOrg(value: OrgCascadeValue) {
  if (value.org4) return { org1: value.org1, org2: value.org2, org3: value.org3 } satisfies OrgCascadeValue
  if (value.org3) return { org1: value.org1, org2: value.org2 } satisfies OrgCascadeValue
  if (value.org2) return { org1: value.org1 } satisfies OrgCascadeValue
  return {} as OrgCascadeValue
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

function queryOf(range: [string, string], granularity: Granularity, org?: OrgCascadeValue) {
  const next = rangeQuery(range)
  return searchQuery([
    ["startDate", next.startDate],
    ["endDate", next.endDate],
    ["granularity", granularity],
    ["org1", org?.org1],
    ["org2", org?.org2],
    ["org3", org?.org3],
    ["org4", org?.org4],
  ])
}

export default function KanbanOrgDetail() {
  const params = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string; granularity?: string }>()

  const org = createMemo(() => parsePath(params.orgPath ?? ""))
  const orgKey = createMemo(() => orgPath(org()))
  const dateRange = createMemo(() => parseQueryRange(search.startDate, search.endDate))
  const granularity = createMemo(() => parseGranularity(search.granularity))
  const listHref = createMemo(() => {
    const scope = parentOrg(org())
    const q = queryOf(dateRange(), granularity(), scope)
    return `/kanban/org?${q.toString()}`
  })

  const [data, { refetch }] = createResource(
    () => ({ org: org(), dateRange: dateRange(), granularity: granularity() }),
    async (input) => {
      try {
        return await getOrgDetail(input)
      } catch (err) {
        showToast({ variant: "error", title: "组织详情加载失败", description: err instanceof Error ? err.message : String(err) })
        return null
      }
    },
  )

  const [cachedDetail, setCachedDetail] = createSignal<{ key: string; data: NonNullable<Awaited<ReturnType<typeof getOrgDetail>>> } | null>(null)

  createEffect(() => {
    const detail = data()
    if (!detail) return
    setCachedDetail({ key: orgKey(), data: detail })
  })

  const view = createMemo(() => {
    const detail = data()
    if (detail) return detail
    const cached = cachedDetail()
    if (cached?.key === orgKey()) return cached.data
    return null
  })

  const summary = createMemo(() => view()?.summary ?? {})
  const members = createMemo(() => view()?.members ?? [])
  const commits = createMemo(() => view()?.commits ?? [])
  const tasks = createMemo(() => view()?.tasks ?? [])
  const taskRatio = createMemo(() => summary().task_efficiency_ratio)
  const commitRatio = createMemo(() => summary().commit_efficiency_ratio)
  const periods = createMemo(() => {
    const source = tasks().length ? tasks() : commits()
    return source.map((item) => item.period_label || item.period_key || "-")
  })
  const taskValues = <T extends keyof (typeof tasks extends () => infer U ? U extends Array<infer R> ? R : never : never)>(field: T) => tasks().map((item) => Number(item[field] ?? 0))
  const commitValues = <T extends keyof (typeof commits extends () => infer U ? U extends Array<infer R> ? R : never : never)>(field: T) => commits().map((item) => Number(item[field] ?? 0))
  const countOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("Task / Commit 数", periods(), [{ name: "Task", data: taskValues("task_count") }, { name: "Commit", data: commitValues("commit_count") }], { type: "line" }) : undefined)
  const codeOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("代码量", periods(), [{ name: "Task", data: taskValues("task_diff_lines") }, { name: "Commit", data: commitValues("commit_diff_lines") }], { type: "line" }) : undefined)
  const timeOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("实际耗时", periods(), [{ name: "Task", data: taskValues("task_real_minutes") }, { name: "Commit", data: commitValues("commit_real_minutes") }], { type: "line", format: (value) => formatDuration(value) }) : undefined)
  const ratioOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("提效比", periods(), [{ name: "Task", data: taskValues("task_efficiency_ratio") }, { name: "Commit", data: commitValues("commit_efficiency_ratio") }], { type: "line", format: (value) => formatPercent(value) }) : undefined)
  const tokenOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("Tokens 消耗", periods(), [{ name: "Tokens", data: tasks().map((item) => (item.upstream_tokens ?? 0) + (item.downstream_tokens ?? 0)) }], { type: "line", format: (value) => value.toLocaleString() }) : undefined)
  const costOption = createMemo<EChartsOption | undefined>(() => periods().length ? chart("费用", periods(), [{ name: "成本", data: tasks().map((item) => Number(item.cost ?? 0)) }], { type: "line", format: (value) => fmtCost(value) }) : undefined)

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-5 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back href={listHref()} label="返回组织视图" />
          <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">组织详情</h1>
        </header>

        <FilterBar
          dateRange={dateRange()}
          orgValue={org()}
          showOrg
          onDateRangeChange={(value) => {
            const next = value ?? defaultWideRange()
            setSearch(Object.fromEntries(queryOf(next, granularity(), org()).entries()))
          }}
          onOrgChange={(value) => {
            navigate(`/kanban/org/${encodeURIComponent(orgPath(value))}?${queryOf(dateRange(), granularity(), value).toString()}`)
          }}
          actions={
            <>
              <label class="flex min-w-0 flex-col gap-2">
                <span class="text-[0.75rem] text-[var(--native-muted)]">聚合粒度</span>
                <select
                  class="flex h-9 min-w-[8rem] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={granularity()}
                  onChange={(e) => {
                    const next = e.currentTarget.value as Granularity
                    setSearch(Object.fromEntries(queryOf(dateRange(), next, org()).entries()))
                  }}
                >
                  <option value="day">天</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                  <option value="year">年</option>
                </select>
              </label>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={data.loading}>{data.loading ? "刷新中..." : "刷新"}</Button>
            </>
          }
        />

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="成员数" value={String(summary().user_count ?? 0)} accent="var(--native-success)" />
          <MetricCard label="Task代码量" value={String(summary().task_diff_lines ?? 0)} accent="var(--native-warning)" />
          <MetricCard label="Commit代码量" value={String(summary().commit_diff_lines ?? 0)} accent="var(--native-primary)" />
          <MetricCard label="Task提效比" value={formatPercent(taskRatio())} accent="var(--native-success)" />
          <MetricCard label="Commit提效比" value={formatPercent(commitRatio())} accent="var(--native-primary)" />
          <MetricCard label="总费用" value={fmtCost(summary().cost)} accent="var(--native-warning)" />
        </section>

        <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
          <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">用户列表</div>
          <div class="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="min-w-[140px]">用户名</TableHead>
                  <TableHead class="min-w-[120px] text-right">Commit代码量</TableHead>
                  <TableHead class="min-w-[130px] text-right">Commit实际耗时</TableHead>
                  <TableHead class="min-w-[120px] text-center">Commit提效比</TableHead>
                  <TableHead class="min-w-[110px] text-right">Task代码量</TableHead>
                  <TableHead class="min-w-[120px] text-right">Task实际耗时</TableHead>
                  <TableHead class="min-w-[110px] text-center">Task提效比</TableHead>
                  <TableHead class="min-w-[120px] text-right">Tokens消耗</TableHead>
                  <TableHead class="min-w-[100px] text-right">费用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={members()}>
                  {(row) => (
                    <TableRow class="cursor-pointer" onClick={() => {
                      const txt = row.user_id?.trim()
                      if (!txt) return
                      navigate(`/kanban/user/${encodeURIComponent(txt)}?${queryOf(dateRange(), granularity(), org()).toString()}`)
                    }}>
                      <TableCell>{row.user_name || row.user_id || "-"}</TableCell>
                      <TableCell class="text-right tabular-nums">{row.commit_diff_lines ?? 0}</TableCell>
                      <TableCell class="text-right">{formatDuration(row.commit_real_minutes)}</TableCell>
                      <TableCell class="text-center"><RatioPill value={row.commit_efficiency_ratio} /></TableCell>
                      <TableCell class="text-right tabular-nums">{row.task_diff_lines ?? 0}</TableCell>
                      <TableCell class="text-right">{formatDuration(row.task_real_minutes)}</TableCell>
                      <TableCell class="text-center"><RatioPill value={row.task_efficiency_ratio} /></TableCell>
                      <TableCell class="text-right tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell>
                      <TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </section>

        <section class="grid gap-4 lg:grid-cols-2">
          <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
            <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">Commits 列表</div>
            <div class="overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead class="min-w-[140px]">时间</TableHead><TableHead class="min-w-[80px] text-right">Task数</TableHead><TableHead class="min-w-[90px] text-right">代码量</TableHead><TableHead class="min-w-[110px] text-right">实际耗时</TableHead><TableHead class="min-w-[150px] text-right">传统开发时长预估</TableHead><TableHead class="min-w-[100px] text-center">提效比</TableHead><TableHead class="min-w-[120px] text-right">Tokens消耗</TableHead><TableHead class="min-w-[100px] text-right">费用</TableHead></TableRow></TableHeader>
                <TableBody>
                  <For each={commits()}>
                    {(row) => <TableRow><TableCell>{row.period_label || row.period_key || "-"}</TableCell><TableCell class="text-right tabular-nums">{row.task_count ?? 0}</TableCell><TableCell class="text-right tabular-nums">{row.commit_diff_lines ?? 0}</TableCell><TableCell class="text-right">{formatDuration(row.commit_real_minutes)}</TableCell><TableCell class="text-right">{formatDuration(row.commit_ancient_minutes)}</TableCell><TableCell class="text-center"><RatioPill value={row.commit_efficiency_ratio} /></TableCell><TableCell class="text-right tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell><TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell></TableRow>}
                  </For>
                </TableBody>
              </Table>
            </div>
          </section>

          <section class="overflow-hidden rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
            <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">Tasks 列表</div>
            <div class="overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead class="min-w-[140px]">时间</TableHead><TableHead class="min-w-[90px] text-right">Commit数</TableHead><TableHead class="min-w-[90px] text-right">代码量</TableHead><TableHead class="min-w-[110px] text-right">实际耗时</TableHead><TableHead class="min-w-[150px] text-right">传统开发时长预估</TableHead><TableHead class="min-w-[100px] text-center">提效比</TableHead><TableHead class="min-w-[120px] text-right">Tokens消耗</TableHead><TableHead class="min-w-[100px] text-right">费用</TableHead></TableRow></TableHeader>
                <TableBody>
                  <For each={tasks()}>
                    {(row) => <TableRow><TableCell>{row.period_label || row.period_key || "-"}</TableCell><TableCell class="text-right tabular-nums">{row.commit_count ?? 0}</TableCell><TableCell class="text-right tabular-nums">{row.task_diff_lines ?? 0}</TableCell><TableCell class="text-right">{formatDuration(row.task_real_minutes)}</TableCell><TableCell class="text-right">{formatDuration(row.task_ancient_minutes)}</TableCell><TableCell class="text-center"><RatioPill value={row.task_efficiency_ratio} /></TableCell><TableCell class="text-right tabular-nums">{fmtTokens(row.upstream_tokens, row.downstream_tokens)}</TableCell><TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell></TableRow>}
                  </For>
                </TableBody>
              </Table>
            </div>
          </section>
        </section>

        <section class="grid gap-4 xl:grid-cols-2">
          <ChartCard option={countOption()} empty="暂无数量图表数据" />
          <ChartCard option={codeOption()} empty="暂无代码量图表数据" />
          <ChartCard option={timeOption()} empty="暂无耗时图表数据" />
          <ChartCard option={ratioOption()} empty="暂无提效比图表数据" />
          <ChartCard option={tokenOption()} empty="暂无 Token 图表数据" />
          <ChartCard option={costOption()} empty="暂无费用图表数据" />
        </section>
      </div>
    </div>
  )
}