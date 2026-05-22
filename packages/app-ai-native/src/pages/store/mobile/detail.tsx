import { createResource, createSignal, createEffect, Show, For } from "solid-js"
import { createHighlighter } from "shiki"
import { useParams } from "@solidjs/router"
import { useTheme } from "@opencode-ai/ui/theme"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/ui/markdown"
import { LocalIcon } from "@/components/local-icon"
import AvatarDisplay from "@/components/avatar-display"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { itemApi, userApi, behaviorApi } from "../lib/api"
import SecurityTag from "../components/security-tag"
import "@/styles/vscode-markdown.css"

const TYPE_META: Record<
  string,
  { accent: string; bg: string; label: string; icon: "sparkles" | "brain" | "console" | "mcp" | "configuration" }
> = {
  skill: { accent: "#ffa000", bg: "color-mix(in srgb, #ffa000 12%, var(--native-panel))", label: "store.sidebar.nav.skills", icon: "sparkles" },
  subagent: { accent: "#1670ff", bg: "color-mix(in srgb, #1670ff 12%, var(--native-panel))", label: "store.sidebar.nav.subagents", icon: "brain" },
  command: { accent: "#09b179", bg: "color-mix(in srgb, #09b179 12%, var(--native-panel))", label: "store.sidebar.nav.commands", icon: "console" },
  mcp: { accent: "#7338f9", bg: "color-mix(in srgb, #7338f9 12%, var(--native-panel))", label: "store.sidebar.nav.mcpServers", icon: "mcp" },
  plugin: { accent: "#EC4899", bg: "color-mix(in srgb, #EC4899 12%, var(--native-panel))", label: "store.sidebar.nav.plugins", icon: "configuration" },
}

const THEMES = { light: "light-plus", dark: "dark-plus" } as const

const TAG_COLOR_BY_CLASS = {
  system: { color: "#e17a0c", background: "#f9a02c1a" },
  custom: { color: "#478be6", background: "#4184e41a" },
} as const

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined

function formatDate(iso: string, locale?: string) {
  const normalized = locale?.startsWith("zh") ? "zh-CN" : "en-US"
  return new Intl.DateTimeFormat(normalized, {
    year: "numeric",
    month: normalized === "zh-CN" ? "long" : "short",
    day: "numeric",
  }).format(new Date(iso))
}

function formatCompactCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
  return String(value)
}

function compareTags(a: { tagClass?: string; slug: string }, b: { tagClass?: string; slug: string }) {
  const ap = a.tagClass === "system" ? 0 : 1
  const bp = b.tagClass === "system" ? 0 : 1
  if (ap !== bp) return ap - bp
  return a.slug.localeCompare(b.slug, undefined, { sensitivity: "base" })
}

function tagStyle(tagClass?: string) {
  const accent = tagClass === "system" ? TAG_COLOR_BY_CLASS.system : TAG_COLOR_BY_CLASS.custom
  return {
    color: accent.color,
    "background-color": `color-mix(in srgb, ${accent.color} 14%, var(--native-panel))`,
  }
}

function tryJson(raw: string): string | null {
  try {
    const unescaped = raw.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r")
    const cleaned = unescaped.replace(/,\s*([\]\}])/g, "$1")
    const parsed = JSON.parse(cleaned)
    if (typeof parsed === "object" && parsed !== null) return JSON.stringify(parsed, null, 2)
    return null
  } catch {
    return null
  }
}

async function highlight(json: string, mode: "light" | "dark") {
  if (!highlighter) highlighter = await createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: ["json"] })
  return highlighter.codeToHtml(json, { lang: "json", theme: THEMES[mode] })
}

export default function MobileStoreDetail() {
  const params = useParams<{ itemId: string }>()
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const auth = useAuth()
  const theme = useTheme()

  const [item] = createResource(() => params.itemId, (id) => itemApi.get(id))

  const [authorName] = createResource(
    () => item()?.createdBy,
    (id) => userApi.getNames([id]).then((names) => names[id] ?? id),
  )

  const [authorInfo] = createResource(
    () => item()?.createdBy,
    async (id) => {
      if (!id) return null
      const info = await userApi.getInfo([id]).catch(() => ({}))
      return info[id] ?? null
    },
  )

  const [favorited, setFavorited] = createSignal(false)
  const [favoriteCount, setFavoriteCount] = createSignal(0)
  const [favoritePending, setFavoritePending] = createSignal(false)

  createEffect(() => {
    const data = item()
    if (!data) return
    setFavorited(Boolean(data.favorited))
    setFavoriteCount(data.favoriteCount ?? 0)
  })

  createEffect(() => {
    const data = item()
    if (!data) return
    void behaviorApi.log(data.id, {
      actionType: "view",
      context: "mobile-detail",
      metadata: { source: "app-ai-native", route: "mobile-store-detail" },
    })
  })

  const [highlighted] = createResource(
    () => {
      const json = tryJson(item()?.content ?? "")
      if (!json) return null
      return { json, mode: theme.mode() === "light" ? "light" : "dark" } as const
    },
    (source) => highlight(source.json, source.mode),
  )

  const meta = () => TYPE_META[item()?.itemType ?? "skill"] ?? TYPE_META.skill

  const toggleFavorite = async () => {
    const data = item()
    if (!data || !auth.user() || auth.loading() || favoritePending()) return
    setFavoritePending(true)
    try {
      const result = favorited()
        ? await behaviorApi.unfavorite(data.id)
        : await behaviorApi.favorite(data.id)
      setFavorited(result.favorited)
      setFavoriteCount(result.favoriteCount)
    } finally {
      setFavoritePending(false)
    }
  }

  return (
    <Show
      when={!item.loading}
      fallback={
        <div class="flex flex-1 items-center justify-center py-16 text-text-weak">
          {language.t("store.loading")}
        </div>
      }
    >
      <Show
        when={item()}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-4 py-16">
            <p class="text-text-weak">{language.t("store.detail.notFound")}</p>
          </div>
        }
      >
        {(data) => {
          const sourceLabel = () => itemFilterOptions.sourceLabel(data().source) || data().source
          const sourceUrl = () => itemFilterOptions.sourceUrl(data().source)

          return (
            <div class="flex flex-1 flex-col min-h-0">
              <div class="flex-1 overflow-y-auto thin-scrollbar">
                {/* Hero */}
                <div class="px-4 pt-4 pb-3">
                  <div class="flex items-center gap-3">
                    <div
                      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ "background-color": meta().bg, color: meta().accent }}
                    >
                      <Icon name={meta().icon} />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h1 class="truncate text-lg font-bold leading-snug text-text-strong">
                        {data().name}
                      </h1>
                      <div class="mt-0.5 flex items-center gap-1.5 text-xs text-text-weak">
                        <span>{language.t("store.capability.type." + (data().itemType ?? "skill"))}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div class="mt-3 flex items-center gap-4 text-[13px] text-text-weak">
                    <span class="inline-flex items-center gap-1">
                      <LocalIcon name="view" size="small" />
                      {formatCompactCount(data().previewCount ?? 0)}
                    </span>
                    <span class="inline-flex items-center gap-1">
                      <LocalIcon name="download" size="small" />
                      {formatCompactCount(data().installCount ?? 0)}
                    </span>
                    <span class="inline-flex items-center gap-1">
                      <LocalIcon name="subscribe" size="small" />
                      {formatCompactCount(favoriteCount())}
                    </span>
                    <Show when={data().source}>
                      <span class="inline-flex items-center gap-1">
                        <LocalIcon name="globe" size="small" />
                        {sourceLabel()}
                      </span>
                    </Show>
                  </div>

                  {/* Tags */}
                  <Show when={(data().tags ?? []).length > 0}>
                    <div class="mt-3 flex flex-wrap items-center gap-1.5">
                      <For each={[...(data().tags ?? [])].sort(compareTags)}>
                        {(tag) => (
                          <span
                            class="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4"
                            style={tagStyle(tag.tagClass)}
                          >
                            <span class="truncate">{tag.slug}</span>
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                {/* Info card */}
                <div class="mx-4 rounded-xl border border-border-weak-base bg-[var(--native-panel)] p-3">
                  <div class="space-y-2.5 text-xs text-text-weak">
                    <Show when={authorInfo() || authorName()}>
                      <div class="flex items-center justify-between">
                        <span class="font-semibold">{language.t("store.detail.author")}</span>
                        <div class="flex items-center gap-1.5">
                          <Show
                            keyed
                            when={authorInfo()}
                            fallback={
                              <AvatarDisplay
                                avatarUrl={undefined}
                                username={authorName() ?? data().createdBy}
                                class="size-4 shrink-0"
                              />
                            }
                          >
                            {(info) => (
                              <AvatarDisplay
                                avatarUrl={info.avatarUrl}
                                username={info.name ?? authorName() ?? data().createdBy}
                                class="size-4 shrink-0"
                              />
                            )}
                          </Show>
                          <span class="truncate max-w-[10rem] text-text-strong">{authorName() ?? data().createdBy}</span>
                        </div>
                      </div>
                    </Show>
                    <div class="flex items-center justify-between">
                      <span class="font-semibold">{language.t("store.detail.created")}</span>
                      <span class="text-text-strong">{formatDate(data().createdAt, language.locale())}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="font-semibold">{language.t("store.detail.updated")}</span>
                      <span class="text-text-strong">{formatDate(data().updatedAt, language.locale())}</span>
                    </div>
                    <Show when={data().securityStatus}>
                      <div class="flex items-center justify-between">
                        <span class="font-semibold">{language.t("store.security.riskLevel")}</span>
                        <SecurityTag status={data().securityStatus} />
                      </div>
                    </Show>
                    <Show when={data().category}>
                      <div class="flex items-center justify-between">
                        <span class="font-semibold">{language.t("store.console.capabilities.category")}</span>
                        <span class="text-text-strong">{itemFilterOptions.categoryLabel(data().category) || data().category}</span>
                      </div>
                    </Show>
                    <Show when={sourceUrl()}>
                      <div class="flex items-center justify-between">
                        <span class="font-semibold">{language.t("store.home.table.source")}</span>
                        <a
                          href={sourceUrl()}
                          target="_blank"
                          rel="noreferrer"
                          class="inline-flex items-center gap-1 text-[11px] font-bold text-[#f58b19]"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3 shrink-0">
                            <path d="M7 17 17 7" />
                            <path d="M9 7h8v8" />
                          </svg>
                          {sourceLabel()}
                        </a>
                      </div>
                    </Show>
                  </div>
                </div>

                {/* Description */}
                <Show when={data().description}>
                  <p class="px-4 pt-4 pb-2 text-[13px] leading-6 text-text-weak">{data().description}</p>
                </Show>

                {/* Content */}
                <Show when={data().content}>
                  <div class="px-4 pb-6 pt-2">
                    <Show
                      when={highlighted()}
                      fallback={
                        <div class="thin-scrollbar overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 px-4 py-3">
                          <Markdown text={data().content} class="vscode-markdown text-14-regular" />
                        </div>
                      }
                    >
                      <div
                        class="thin-scrollbar overflow-x-auto overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 p-3 text-12-mono leading-6 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0"
                        innerHTML={highlighted()}
                      />
                    </Show>
                  </div>
                </Show>
              </div>

              {/* Bottom bar */}
              <div class="shrink-0 border-t border-border-weak-base bg-background-base px-4 py-3 safe-area-bottom">
                <button
                  onClick={() => void toggleFavorite()}
                  disabled={!auth.user() || auth.loading() || favoritePending()}
                  class="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  classList={{
                    "bg-bg-muted text-text-strong": favorited(),
                    "bg-[var(--native-primary)] text-white hover:opacity-90": !favorited(),
                  }}
                >
                  <span>
                    {auth.user()
                      ? favorited()
                        ? language.t("store.detail.unfavorite")
                        : language.t("store.detail.favorite")
                      : language.t("store.detail.favoriteSignIn")}
                  </span>
                </button>
              </div>
            </div>
          )
        }}
      </Show>
    </Show>
  )
}
