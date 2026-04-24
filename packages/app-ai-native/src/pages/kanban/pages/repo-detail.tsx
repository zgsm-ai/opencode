import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Back from "../components/back"
import { RatioPill } from "../components/ratio-pill"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { AddRepoToProjectDialog } from "../components/dialogs/add-repo-to-project-dialog"
import { getRepoDetail } from "../lib/api"
import { defaultWideRange, parseQueryRange, rangeQuery, searchQuery } from "../lib/date-range"
import { formatDuration, formatLocalTime, shortId } from "../lib/formatters"
import type { DateRangeValue, RepoCommitRow, RepoTaskRow } from "../lib/types"

function formatDay(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function commitEffRatio(row: RepoCommitRow) {
  const ancient = row.commit_ancient_minutes_manual ?? row.commit_ancient_minutes
  const real = row.commit_real_minutes_manual ?? row.commit_real_minutes
  if (!ancient || !real || ancient <= 0 || real <= 0) return 0
  return (ancient / real) * 100
}

function taskEffRatio(row: RepoTaskRow) {
  const ancient = row.task_ancient_minutes_manual ?? row.task_ancient_minutes
  const real = row.task_real_minutes_manual ?? row.task_real_minutes
  if (!ancient || !real || ancient <= 0 || real <= 0) return 0
  return (ancient / real) * 100
}

function ReasonTip(props: { value?: string }) {
  return (
    <Show when={props.value?.trim()}>
      <Tooltip value={props.value} placement="top">
        <span class="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] text-[var(--native-muted)]">?</span>
      </Tooltip>
    </Show>
  )
}

function MetricCard(props: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <article
      class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 shadow-[var(--native-shadow-sm)]"
      style={{ "--metric-accent": props.accent ?? "var(--native-primary)" }}
    >
      <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:color-mix(in_oklab,var(--metric-accent)_72%,var(--native-dim))]">{props.label}</p>
      <p class="mt-2 text-[1.4rem] leading-none font-semibold tracking-[-0.04em] text-[var(--native-foreground)]">{props.value}</p>
      <Show when={props.hint}>
        <p class="mt-2 text-[0.8125rem] text-[var(--native-muted)]">{props.hint}</p>
      </Show>
    </article>
  )
}

export default function KanbanRepoDetail() {
  const params = useParams()
  const navigate = useNavigate()
  const dialog = useDialog()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string }>()

  const repoAddr = createMemo(() => decodeURIComponent(params.repoAddr ?? "").trim())
  const repoBranch = createMemo(() => decodeURIComponent(params.repoBranch ?? "").trim())
  const repoKey = createMemo(() => `${repoAddr()}::${repoBranch()}`)
  const dateRange = createMemo(() => parseQueryRange(search.startDate, search.endDate))
  const listHref = createMemo(() => {
    const q = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
    ])
    const txt = q.toString()
    return txt ? `/kanban/repo?${txt}` : "/kanban/repo"
  })

  const detailHref = (branch?: string) => {
    const next = rangeQuery(dateRange())
    const q = searchQuery([
      ["startDate", next.startDate],
      ["endDate", next.endDate],
    ])
    const txt = q.toString()
    return branch
      ? `/kanban/repo/${encodeURIComponent(repoAddr())}/${encodeURIComponent(branch)}?${txt}`
      : `/kanban/repo/${encodeURIComponent(repoAddr())}?${txt}`
  }

  const [detail, { refetch }] = createResource(
    () => ({
      repoAddr: repoAddr(),
      repoBranch: repoBranch(),
      start: dateRange()[0],
      end: dateRange()[1],
    }),
    async (input) => {
      if (!input.repoAddr) return null
      try {
        return await getRepoDetail({
          repoAddr: input.repoAddr,
          repoBranch: input.repoBranch,
          dateRange: [input.start, input.end],
        })
      } catch (err) {
        showToast({
          variant: "error",
          title: "仓库详情加载失败",
          description: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    },
  )

  const [cachedDetail, setCachedDetail] = createSignal<{ key: string; data: NonNullable<Awaited<ReturnType<typeof getRepoDetail>>> } | null>(null)

  createEffect(() => {
    const data = detail()
    if (!data) return
    setCachedDetail({ key: repoKey(), data })
  })

  const view = createMemo(() => {
    const data = detail()
    if (data) return data
    const cached = cachedDetail()
    if (cached?.key === repoKey()) return cached.data
    return null
  })

  const commits = createMemo(() => view()?.commits ?? [])
  const tasks = createMemo(() => view()?.tasks ?? [])
  const branches = createMemo(() => view()?.branches ?? [])
  const efficiency = createMemo(() => view()?.efficiency ?? {})
  const efficiencyRatio = createMemo(() => efficiency().efficiency_ratio ?? null)

  const totalDiffLines = createMemo(() => commits().reduce((sum, item) => sum + (item.diff_lines ?? 0), 0))
  const totalTokens = createMemo(() => tasks().reduce((sum, item) => sum + (item.upstream_tokens ?? 0) + (item.downstream_tokens ?? 0), 0))
  const totalCost = createMemo(() => tasks().reduce((sum, item) => sum + (item.cost ?? 0), 0))
  const contributorCount = createMemo(() => {
    const names = new Set<string>()
    for (const item of commits()) {
      if (item.git_user_name?.trim()) names.add(item.git_user_name.trim())
    }
    for (const item of tasks()) {
      if (item.user_name?.trim()) names.add(item.user_name.trim())
    }
    return names.size
  })

  const activityRange = createMemo(() => {
    const points = commits()
      .map((item) => item.commit_time)
      .filter((item): item is string => !!item)
      .map((item) => new Date(item).getTime())
      .filter((item) => Number.isFinite(item))
    if (!points.length) return "-"
    return `${formatDay(new Date(Math.min(...points)).toISOString())} ~ ${formatDay(new Date(Math.max(...points)).toISOString())}`
  })

  const openAddDialog = () => {
    if (!repoAddr()) return
    dialog.show(() => (
      <AddRepoToProjectDialog
        repoAddr={repoAddr()}
        repoBranch={repoBranch()}
        commits={commits()}
        dateRange={dateRange()}
        onAdded={() => void refetch()}
      />
    ))
  }

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-6 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <Back href={listHref()} label="返回仓库列表" />

      <header class="flex w-full flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 class="mt-2 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">仓库详情</h1>
        </div>

        <div class="flex min-w-0 flex-nowrap items-center justify-end gap-3 overflow-x-auto">
          <select
            class="flex h-10 min-w-[12rem] shrink-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={repoBranch()}
            onChange={(e) => {
              const next = e.currentTarget.value.trim()
              navigate(detailHref(next || undefined))
            }}
          >
            <option value="">全部分支</option>
            <For each={branches()}>
              {(item) => <option value={item}>{item}</option>}
            </For>
          </select>

          <DateRangePicker
            value={dateRange()}
            fullWidth={false}
            onChange={(value) => {
              const next = value ?? defaultWideRange()
              setSearch(Object.fromEntries(searchQuery([
                ["startDate", rangeQuery(next).startDate],
                ["endDate", rangeQuery(next).endDate],
              ]).entries()))
            }}
            placeholder="选择日期范围"
          />

          <Button size="sm" class="shrink-0" onClick={openAddDialog} disabled={!view()}>
            添加到 Project
          </Button>
        </div>
      </header>

      <div class="flex w-full flex-col gap-5">
        <Show when={!detail.loading || view()} fallback={<div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">仓库详情加载中...</div>}>
          <Show when={view()} fallback={<div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">没有查询到仓库详情</div>}>
            {(item) => (
              <>
                <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                  <div class="mb-4 text-[1rem] font-semibold text-[var(--native-foreground)]">基础信息</div>
                  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetricCard label="仓库地址" value={item().repo_addr || "-"} hint="当前查看的 repo_addr" />
                    <MetricCard label="分支" value={repoBranch() || item().repo_branch || "全部分支"} hint="当前详情分支上下文" accent="var(--native-info, var(--native-primary))" />
                    <MetricCard label="活跃时间" value={activityRange()} hint="基于 commits 时间范围" accent="var(--native-success)" />
                    <MetricCard label="提交数" value={String(item().summary.commit_count ?? commits().length)} accent="var(--native-warning)" />
                    <MetricCard label="任务数" value={String(item().summary.task_count ?? tasks().length)} accent="var(--native-primary)" />
                    <MetricCard label="总 Tokens" value={totalTokens().toLocaleString()} accent="var(--native-success)" />
                  </div>
                </section>

                <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
                  <div class="mb-4 text-[1rem] font-semibold text-[var(--native-foreground)]">度量信息（基于 Commits 汇总）</div>
                  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetricCard
                      label="传统开发时长预估"
                      value={formatDuration(efficiency().repo_ancient_minutes)}
                      hint={efficiency().repo_ancient_minutes_reason || "-"}
                      accent="var(--native-warning)"
                    />
                    <MetricCard
                      label="实际耗时"
                      value={formatDuration(efficiency().repo_real_minutes)}
                      hint={efficiency().repo_real_minutes_reason || "-"}
                      accent="var(--native-primary)"
                    />
                    <MetricCard
                      label="提效比"
                      value={efficiencyRatio() == null ? "-" : `${Math.round(efficiencyRatio()!)}%`}
                      accent={efficiencyRatio() != null && efficiencyRatio()! >= 300 ? "var(--native-success)" : "var(--native-primary)"}
                    />
                    <MetricCard label="代码行数" value={`${totalDiffLines().toLocaleString()} 行`} accent="var(--native-info, var(--native-primary))" />
                    <MetricCard label="总费用（Tasks）" value={totalCost() > 0 ? `${totalCost().toFixed(2)} 元` : "-"} accent="var(--native-warning)" />
                    <MetricCard label="贡献者" value={`${contributorCount()} 人`} accent="var(--native-success)" />
                  </div>

                  <div class="mt-4 grid gap-4 lg:grid-cols-2">
                    <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 text-sm text-[var(--native-muted)]">
                      <div class="flex items-center text-[var(--native-foreground)]">
                        <span class="font-medium">传统开发时长预估原因</span>
                        <ReasonTip value={efficiency().repo_ancient_minutes_reason} />
                      </div>
                      <p class="mt-2 leading-6">{efficiency().repo_ancient_minutes_reason || "-"}</p>
                    </div>
                    <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 text-sm text-[var(--native-muted)]">
                      <div class="flex items-center text-[var(--native-foreground)]">
                        <span class="font-medium">实际耗时原因</span>
                        <ReasonTip value={efficiency().repo_real_minutes_reason} />
                      </div>
                      <p class="mt-2 leading-6">{efficiency().repo_real_minutes_reason || "-"}</p>
                    </div>
                  </div>
                </section>

                <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
                  <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">
                    Commits ({commits().length})
                  </div>
                  <div class="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead class="min-w-[100px]">Commit ID</TableHead>
                          <TableHead class="min-w-[150px]">时间</TableHead>
                          <TableHead class="min-w-[90px]">用户</TableHead>
                          <TableHead class="min-w-[220px]">说明</TableHead>
                          <TableHead class="min-w-[90px] text-right">代码行数</TableHead>
                          <TableHead class="min-w-[100px] text-right">实际耗时</TableHead>
                          <TableHead class="min-w-[140px] text-right">传统开发时长预估</TableHead>
                          <TableHead class="min-w-[90px] text-center">硅含量</TableHead>
                          <TableHead class="min-w-[90px] text-center">提效比</TableHead>
                          <TableHead class="min-w-[110px] text-right">Tokens消耗</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <For each={commits()}>
                          {(row) => (
                            <TableRow>
                              <TableCell>{shortId(row.commit_id)}</TableCell>
                              <TableCell>{formatLocalTime(row.commit_time)}</TableCell>
                              <TableCell>{row.git_user_name || "-"}</TableCell>
                              <TableCell>{row.comment || "-"}</TableCell>
                              <TableCell class="text-right tabular-nums">{row.diff_lines ?? "-"}</TableCell>
                              <TableCell class="text-right">{formatDuration(row.commit_real_minutes_manual ?? row.commit_real_minutes)}</TableCell>
                              <TableCell class="text-right">{formatDuration(row.commit_ancient_minutes_manual ?? row.commit_ancient_minutes)}</TableCell>
                              <TableCell class="text-center"><RatioPill value={row.silica} digits={1} /></TableCell>
                              <TableCell class="text-center"><RatioPill value={commitEffRatio(row)} /></TableCell>
                              <TableCell class="text-right tabular-nums">{((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)) > 0 ? ((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)).toLocaleString() : "-"}</TableCell>
                            </TableRow>
                          )}
                        </For>
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <Show when={tasks().length > 0}>
                  <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
                    <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">
                      Tasks ({tasks().length})
                    </div>
                    <div class="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead class="min-w-[100px]">Task ID</TableHead>
                            <TableHead class="min-w-[150px]">时间</TableHead>
                            <TableHead class="min-w-[90px]">用户</TableHead>
                            <TableHead class="min-w-[220px]">说明</TableHead>
                            <TableHead class="min-w-[90px] text-right">代码行数</TableHead>
                            <TableHead class="min-w-[100px] text-right">实际耗时</TableHead>
                            <TableHead class="min-w-[140px] text-right">传统开发时长预估</TableHead>
                            <TableHead class="min-w-[90px] text-center">提效比</TableHead>
                            <TableHead class="min-w-[80px] text-right">费用</TableHead>
                            <TableHead class="min-w-[110px] text-right">Tokens消耗</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <For each={tasks()}>
                            {(row) => (
                              <TableRow>
                                <TableCell>{shortId(row.task_id)}</TableCell>
                                <TableCell>{formatLocalTime(row.start_time)}</TableCell>
                                <TableCell>{row.user_name || "-"}</TableCell>
                                <TableCell>{row.title || "-"}</TableCell>
                                <TableCell class="text-right tabular-nums">{row.diff_lines ?? "-"}</TableCell>
                                <TableCell class="text-right">{formatDuration(row.task_real_minutes_manual ?? row.task_real_minutes)}</TableCell>
                                <TableCell class="text-right">{formatDuration(row.task_ancient_minutes_manual ?? row.task_ancient_minutes)}</TableCell>
                                <TableCell class="text-center"><RatioPill value={taskEffRatio(row)} /></TableCell>
                                <TableCell class="text-right tabular-nums">{row.cost != null && row.cost > 0 ? row.cost.toFixed(2) : "-"}</TableCell>
                                <TableCell class="text-right tabular-nums">{((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)) > 0 ? ((row.upstream_tokens ?? 0) + (row.downstream_tokens ?? 0)).toLocaleString() : "-"}</TableCell>
                              </TableRow>
                            )}
                          </For>
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>
    </div>
  )
}