import { A, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, For, on, untrack, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import { createStore } from "solid-js/store"
import { ArrowRight, Building2, ChevronDown, ClipboardList, FolderGit2, FolderOpen, GitCommitHorizontal, GitMerge, Users, Wallet } from "lucide-solid"
import { showToast } from "@opencode-ai/ui/toast"
import { cn } from "@/lib/utils"
import { env } from "@/lib/env"
import { DateRangePicker } from "../components/filters/date-range-picker"
import { queryDashboardSummary } from "../lib/api"
import { normalizeDateRange, parseQueryRange, rangeQuery, readQueryRange, searchQuery, sameRange } from "../lib/date-range"
import { formatPercent } from "../lib/formatters"
import type { DashboardSummary } from "../lib/types"

function fmtInt(value?: number | null) {
  if (value == null) return "-"
  return new Intl.NumberFormat("zh-CN").format(Math.round(value))
}

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return null
  return {
    prefix: "¥",
    amount: value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  }
}

function fmtRatio(value?: number | null) {
  return formatPercent(value)
}

function days(value?: number | null) {
  if (value == null || value <= 0) return "-"
  const minutes = Math.round(Number(value))
  if (!Number.isFinite(minutes) || minutes <= 0) return "-"
  return (minutes / 480).toFixed(1)
}

function saved(summary: DashboardSummary) {
  return Math.max(0, summary.total_task_ancient_minutes - summary.total_real_minutes)
}

function blank(): DashboardSummary {
  return {
    total_tasks: 0,
    total_users: 0,
    total_repos: 0,
    total_commits: 0,
    total_work_dirs: 0,
    total_cost: 0,
    total_tokens: 0,
    total_diff_lines: 0,
    total_task_ancient_minutes: 0,
    total_real_minutes: 0,
    avg_efficiency_ratio: null,
  }
}

function MetricCard(props: {
  label: string
  value: string | { prefix: string; amount: string }
  hint: string
  tone: string
  iconShell: string
  icon: JSX.Element
  href?: string
  live?: boolean
}) {
  const body = (
    <article
      class={cn(
        "group relative h-full min-h-[11rem] overflow-hidden rounded-[20px] border border-[color:color-mix(in_oklab,var(--native-border)_18%,white)] bg-white px-5 py-4 shadow-[0_10px_26px_-20px_rgba(31,53,120,0.22),0_2px_10px_-6px_rgba(71,85,145,0.12)] transition-transform duration-200 ease-out [@media(hover:hover)]:hover:-translate-y-0.5 active:scale-[0.98]",
        props.live && "cursor-pointer",
      )}
      style={{ "--card-tone": props.tone, "touch-action": "manipulation" }}
    >
      <div class="flex items-start justify-between gap-4">
        <p class="m-0 text-[0.95rem] font-medium tracking-[-0.02em] text-[#2a3348]">{props.label}</p>
        <div class={cn("flex h-12 w-12 items-center justify-center rounded-full", props.iconShell)}>
          {props.icon}
        </div>
      </div>

      {typeof props.value === "string"
        ? <p class="mt-4 text-[3rem] leading-none font-medium tracking-[-0.07em] text-[var(--card-tone)] tabular-nums">{props.value}</p>
        : <p class="mt-4 flex items-baseline gap-1.5 text-[var(--card-tone)] tabular-nums">
            <span class="text-[1.55rem] leading-none font-medium tracking-[-0.03em]">{props.value.prefix}</span>
            <span class="text-[3rem] leading-none font-medium tracking-[-0.07em]">{props.value.amount}</span>
          </p>}
      <p class="mt-5 text-[0.95rem] leading-6 text-[#97a2b8]">{props.hint}</p>
    </article>
  )

  return props.href && props.live
    ? <A href={props.href} class="block h-full">{body}</A>
    : body
}

function NavCard(props: {
  title: string
  iconShell: string
  icon: JSX.Element
  href?: string
  live?: boolean
}) {
  const body = (
    <article
      class={cn(
        "group relative flex min-h-[7.25rem] items-center justify-between gap-4 rounded-[18px] border border-[color:color-mix(in_oklab,var(--native-border)_16%,white)] bg-white px-5 py-4 shadow-[0_10px_24px_-22px_rgba(43,63,129,0.3),0_2px_12px_-8px_rgba(71,85,145,0.14)] transition-transform duration-200 ease-out [@media(hover:hover)]:hover:-translate-y-0.5 active:scale-[0.98]",
        props.live && "cursor-pointer",
      )}
      style={{ "touch-action": "manipulation" }}
    >
      <div class="flex min-w-0 items-center gap-4">
        <div class={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]", props.iconShell)}>
          {props.icon}
        </div>
        <h3 class="m-0 text-[1.18rem] font-medium tracking-[-0.03em] text-[#2a3348]">{props.title}</h3>
      </div>

      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#7280a0] transition-transform duration-200 ease-out [@media(hover:hover)]:group-hover:translate-x-0.5 [@media(hover:hover)]:group-hover:text-[#4f648f]">
        <ArrowRight class="h-5 w-5" stroke-width={1.9} />
      </div>
    </article>
  )

  return props.href && props.live
    ? <A href={props.href} class="block">{body}</A>
    : body
}

function TopLink(props: { title: string; href: string; active?: boolean }) {
  return (
    <A
      href={props.href}
      class={cn(
        "inline-flex h-11 items-center rounded-full px-4 text-[0.95rem] font-medium tracking-[-0.02em] transition-all duration-200 ease-out active:scale-[0.98]",
        props.active
          ? "bg-white text-[#182235] shadow-[0_10px_22px_-18px_rgba(43,63,129,0.4)]"
          : "text-[#53627d] [@media(hover:hover)]:hover:bg-white/88 [@media(hover:hover)]:hover:text-[#182235]",
      )}
      style={{ "touch-action": "manipulation" }}
    >
      {props.title}
    </A>
  )
}

function TopMenu(props: { title: string; items: Array<{ title: string; href: string }> }) {
  return (
    <div class="group relative">
      <div class="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[0.95rem] font-medium tracking-[-0.02em] text-[#53627d] transition-all duration-200 ease-out [@media(hover:hover)]:group-hover:bg-white/88 [@media(hover:hover)]:group-hover:text-[#182235]">
        <span>{props.title}</span>
        <ChevronDown class="h-4 w-4 transition-transform duration-200 ease-out [@media(hover:hover)]:group-hover:rotate-180" stroke-width={1.8} />
      </div>

      <div class="pointer-events-none invisible absolute left-0 top-full z-20 min-w-[12rem] pt-3 translate-y-2 transition-transform duration-150 ease-out group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0">
        <div
          class="relative isolate overflow-hidden rounded-[18px] border border-[#dde3ee] shadow-[0_18px_34px_-24px_rgba(34,58,120,0.28),0_8px_16px_-12px_rgba(72,90,140,0.14)]"
          style={{ "background-color": "#ffffff" }}
        >
          <div class="absolute inset-0" style={{ "background-color": "#ffffff" }} />
          <div class="relative flex flex-col gap-1 p-2">
            <For each={props.items}>{(item) => (
              <A
                href={item.href}
                class="flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[0.92rem] font-medium tracking-[-0.02em] text-[#32405f] transition-colors duration-150 [@media(hover:hover)]:hover:bg-[#f3f7ff] [@media(hover:hover)]:hover:text-[#182235]"
              >
                <span>{item.title}</span>
                <ArrowRight class="h-4 w-4 text-[#8fa1c1]" stroke-width={1.9} />
              </A>
            )}</For>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function KanbanHome() {
  const language = useLanguage()
  const [search, setSearch] = useSearchParams<{ startDate?: string; endDate?: string }>()
  const [state, setState] = createStore({
    dateRange: parseQueryRange(search.startDate, search.endDate),
  })

  createEffect(on(
    () => [search.startDate, search.endDate],
    () => {
      const next = readQueryRange(search.startDate, search.endDate)
      if (next && !sameRange(untrack(() => state.dateRange), next)) setState("dateRange", next)
    },
  ))

  createEffect(() => {
    const next = normalizeDateRange(state.dateRange)
    if (!next) return

    const query = rangeQuery(next)
    const mirror = searchQuery([
      ["startDate", query.startDate],
      ["endDate", query.endDate],
    ])
    const current = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
    ])
    if (mirror.toString() !== current.toString()) setSearch(Object.fromEntries(mirror.entries()))
  })

  const [summary] = createResource(
    () => ({
      start: state.dateRange[0],
      end: state.dateRange[1],
    }),
    async (input) => {
      try {
        const data = await queryDashboardSummary({
          dateRange: [input.start, input.end],
        })
        return data
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast({
          variant: "error",
          title: language.t("kanban.home.loadFailed"),
          description: msg,
        })
        return blank()
      }
    },
  )

  const view = createMemo(() => summary.latest ?? summary() ?? blank())
  const query = createMemo(() => searchQuery([
    ["startDate", rangeQuery(state.dateRange).startDate],
    ["endDate", rangeQuery(state.dateRange).endDate],
  ]).toString())
  const href = (path: string) => query() ? `${path}?${query()}` : path

  const metrics = createMemo(() => [
    {
      label: language.t("kanban.home.metric.totalRepos"),
      value: fmtInt(view().total_repos),
      hint: language.t("kanban.home.metric.workDirs", { count: fmtInt(view().total_work_dirs) }),
      tone: "#2d6bff",
      iconShell: "bg-[#eef4ff] text-[#2d6bff]",
      icon: <FolderGit2 class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/repo",
      live: true,
    },
    {
      label: language.t("kanban.home.metric.totalUsers"),
      value: fmtInt(view().total_users),
      hint: language.t("kanban.home.metric.taskSamples", { count: fmtInt(view().total_tasks) }),
      tone: "#18a957",
      iconShell: "bg-[#edf9f0] text-[#18a95@7]",
      icon: <Users class="h-5 w-5" stroke-width={1.9} />,
    },
    {
      label: language.t("kanban.home.metric.totalTasks"),
      value: fmtInt(view().total_tasks),
      hint: "",
      tone: "#ff7a00",
      iconShell: "bg-[#fff3e8] text-[#ff7a00]",
      icon: <ClipboardList class="h-5 w-5" stroke-width={1.9} />,
    },
    {
      label: language.t("kanban.home.metric.totalCommits"),
      value: fmtInt(view().total_commits),
      hint: language.t("kanban.home.metric.diffLines", { count: fmtInt(view().total_diff_lines) }),
      tone: "#8a4cf6",
      iconShell: "bg-[#f5eefe] text-[#8a4cf6]",
      icon: <GitMerge class="h-5 w-5" stroke-width={1.9} />,
    },
    {
      label: language.t("kanban.home.metric.totalCost"),
      value: fmtCost(view().total_cost) ?? "-",
      hint: language.t("kanban.home.metric.tokens", { count: fmtInt(view().total_tokens) }),
      tone: "#2d6bff",
      iconShell: "bg-[#eef4ff] text-[#2d6bff]",
      icon: <Wallet class="h-5 w-5" stroke-width={1.9} />,
    },
  ])

  const nav = createMemo(() => [
    {
      title: language.t("kanban.home.nav.repo"),
      iconShell: "bg-[#eef4ff] text-[#2d6bff]",
      icon: <FolderGit2 class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/repo",
      live: true,
    },
    {
      title: language.t("kanban.home.nav.user"),
      iconShell: "bg-[#edf9f0] text-[#18a957]",
      icon: <Users class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/user",
      live: true,
    },
    {
      title: language.t("kanban.home.nav.org"),
      iconShell: "bg-[#f3ecff] text-[#b188ef]",
      icon: <Building2 class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/org",
      live: true,
    },
    {
      title: language.t("kanban.home.nav.commit"),
      iconShell: "bg-[#fff3e8] text-[#ff8a24]",
      icon: <GitMerge class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/commit",
      live: true,
    },
    {
      title: language.t("kanban.home.nav.task"),
      iconShell: "bg-[#fff8df] text-[#f0b93f]",
      icon: <ClipboardList class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/task",
      live: true,
    },
    {
      title: language.t("kanban.home.nav.project"),
      iconShell: "bg-[#eef4ff] text-[#5c88ff]",
      icon: <FolderOpen class="h-5 w-5" stroke-width={1.9} />,
      href: "/kanban/project",
      live: true,
    },
  ])

  const summaryStat = createMemo(() => [
    {
      label: language.t("kanban.home.summary.savedTime"),
      value: days(saved(view())),
      tone: "text-[#1f2937]",
    },
    {
      label: language.t("kanban.home.summary.traditionalEst"),
      value: days(view().total_task_ancient_minutes),
      tone: "text-[#1f2937]",
    },
    {
      label: language.t("kanban.home.summary.actualTime"),
      value: days(view().total_real_minutes),
      tone: "text-[#1f2937]",
    },
  ])

  const top = createMemo(() => ({
    org: [
      { title: language.t("kanban.home.shortNav.org"), href: href("/kanban/org") },
      { title: language.t("kanban.home.shortNav.user"), href: href("/kanban/user") },
    ],
    project: [
      { title: language.t("kanban.home.shortNav.project"), href: href("/kanban/project") },
      { title: language.t("kanban.home.shortNav.repo"), href: href("/kanban/repo") },
      { title: language.t("kanban.home.shortNav.commit"), href: href("/kanban/commit") },
      { title: language.t("kanban.home.shortNav.task"), href: href("/kanban/task") },
    ],
  }))

  return (
    <div class="min-h-full overflow-x-clip bg-[#fafbfe] px-[clamp(1rem,3vw,4.5rem)] pb-[clamp(1rem,2vw,2rem)]">
      <div class="mx-auto flex w-full flex-col gap-6">
        <nav class="flex min-h-[80px] flex-col gap-3 border-b border-[#dde3ee] px-1 py-3 lg:h-[80px] lg:flex-row lg:items-center lg:justify-between lg:px-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <TopLink title={language.t("kanban.home.topMenu.home")} href={href("/kanban")} active={true} />
            <TopMenu title={language.t("kanban.home.topMenu.org")} items={top().org} />
            <TopMenu title={language.t("kanban.home.topMenu.project")} items={top().project} />
          </div>

          <div class="w-full lg:w-[15.5rem] lg:flex-none lg:[&>div]:min-w-0 lg:[&>div]:gap-1.5 lg:[&>div]:px-3 lg:[&>div>div:last-child]:gap-1 lg:[&_[aria-label='Open_date_range_picker']]:h-7 lg:[&_[aria-label='Open_date_range_picker']]:w-7">
            <DateRangePicker
              value={state.dateRange}
              onChange={(value) => {
                if (!value) return
                setState("dateRange", value)
              }}
              clearable={false}
              size="sm"
              fullWidth={true}
            />
          </div>
        </nav>

        <header class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 flex-1 pt-1">
            <h1 class="whitespace-nowrap font-[var(--native-font-display)] text-[clamp(2rem,4vw,2.7rem)] leading-[1.18] font-medium tracking-[-0.05em] text-[#182235]">
                {language.t("kanban.home.title")}
            </h1>
          </div>
        </header>

        <section class="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(25rem,0.88fr)]">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <For each={metrics()}>{(item, index) => (
              <div class={cn(index() === 4 && "xl:col-span-2") }>
                <MetricCard {...item} />
              </div>
            )}</For>
          </div>

          <section class="relative overflow-hidden rounded-[22px] border border-[color:color-mix(in_oklab,var(--native-primary)_14%,white)] bg-[linear-gradient(115deg,#f7faff_42%,#e8f0ff_100%)] px-6 pt-6 pb-10 shadow-[0_18px_38px_-30px_rgba(50,92,191,0.42),0_10px_24px_-18px_rgba(89,118,195,0.22)]">
            <div class="flex h-full flex-col justify-between gap-8">
              <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div class="max-w-[16rem]">
                  <div class="flex items-center gap-2 text-[#2a3348]">
                    <p class="m-0 text-[0.95rem] font-medium tracking-[-0.02em]">{language.t("kanban.home.summary.efficiency")}</p>
                  </div>
                  <p class="mt-10 text-[clamp(2.4rem,5vw,4rem)] leading-none font-medium tracking-[-0.08em] text-[#2d6bff] tabular-nums">{fmtRatio(view().avg_efficiency_ratio)}</p>
                </div>

                <div class="relative mx-auto h-[12rem] w-full max-w-[20rem] shrink-0 overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_50%_65%,rgba(91,132,255,0.12),transparent_54%),radial-gradient(circle_at_68%_22%,rgba(137,172,255,0.14),transparent_28%),transparent]">
                  <img
                    src={`${(env.BASE_PATH || "").replace(/\/+$/, "")}/kanban/ratio.webp`}
                    alt={language.t("kanban.home.summary.efficiency")}
                    class="absolute inset-0 h-full w-full object-contain object-center"
                    loading="eager"
                  />
                </div>
              </div>

              <div class="grid gap-4 border-t border-[#d9e4fb] pt-5 md:grid-cols-3 md:divide-x md:divide-[#d9e4fb] md:gap-0">
                <For each={summaryStat()}>
                  {(item) => (
                    <div class="space-y-2 md:px-5 first:md:pl-0 last:md:pr-0">
                      <p class="text-[0.95rem] text-[#33405b]">{item.label}</p>
                      <p class={`text-[2.2rem] leading-none font-medium tracking-[-0.06em] tabular-nums ${item.tone}`}>{item.value}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <p class="absolute right-6 bottom-4 text-[0.78rem] leading-none tracking-[-0.01em] text-[#8a96ad]">
              {language.t("kanban.home.summary.unit", { unit: language.t("kanban.unit.manDays") })}
            </p>
          </section>
        </section>

        <section class="grid gap-4">
          <div>
            <h2 class="text-[1.55rem] font-medium tracking-[-0.04em] text-[#182235]">{language.t("kanban.home.nav.entry")}</h2>
          </div>

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <For each={nav()}>{(item) => <NavCard {...item} />}</For>
          </div>
        </section>
      </div>
    </div>
  )
}