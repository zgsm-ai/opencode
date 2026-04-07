import { createResource, createSignal, createEffect, Show, For } from "solid-js"
import { createHighlighter } from "shiki"
import { useTheme } from "@opencode-ai/ui/theme"
import { Icon } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { artifactApi, itemApi, scanApi, userApi, type CapabilityItem, type ScanResult } from "../lib/api"
import { useLanguage } from "@/context/language"
import { categoryKey, formatBytes } from "../lib/constants"
import SecurityTag, { VerdictTag, type Verdict } from "./security-tag"

const TYPE_META: Record<string, { accent: string; label: string }> = {
  skill: { accent: "rgb(234,179,8)", label: "store.sidebar.nav.skills" },
  subagent: { accent: "rgb(59,130,246)", label: "store.sidebar.nav.subagents" },
  command: { accent: "rgb(34,197,94)", label: "store.sidebar.nav.commands" },
  mcp: { accent: "rgb(168,85,247)", label: "store.sidebar.nav.mcpServers" },
}

const THEMES = { light: "github-light", dark: "github-dark" } as const

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined

export function getInstallCommand(item: CapabilityItem) {
  const registry = item.registry?.name || "public"
  return `cs plugin add ${item.itemType} ${registry}/${item.slug}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
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

function renderMd(content: string) {
  return content.split("\n").map((line) => {
    if (line.startsWith("# ")) return <h1 class="text-20-medium text-text-strong mt-5 mb-2">{line.slice(2)}</h1>
    if (line.startsWith("## ")) return <h2 class="text-16-medium text-text-strong mt-4 mb-1.5">{line.slice(3)}</h2>
    if (line.startsWith("### ")) return <h3 class="text-14-medium text-text-strong mt-3 mb-1.5">{line.slice(4)}</h3>
    if (line.startsWith("- ")) return <li class="ml-5 list-disc mb-0.5 text-text-weak">{line.slice(2)}</li>
    if (/^\d+\. /.test(line)) return <li class="ml-5 list-decimal mb-0.5 text-text-weak">{line.replace(/^\d+\. /, "")}</li>
    if (line.startsWith("```")) return <div class="text-12-mono bg-bg-muted px-3 py-1.5 rounded my-2">{line}</div>
    if (line.trim()) return <p class="mb-1.5 leading-relaxed text-text-weak">{line}</p>
    return <br />
  })
}

function ScanRow(props: { scan: ScanResult }) {
  const [open, setOpen] = createSignal(false)
  const language = useLanguage()

  return (
    <div class="overflow-hidden rounded-lg border border-border-weak-base">
      <div
        onClick={() => setOpen((value) => !value)}
        class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-bg-muted/50"
      >
        <div class="min-w-0 flex-1">
          <div class="mb-0.5 flex items-center gap-2">
            <SecurityTag status={props.scan.riskLevel as never} />
            <VerdictTag verdict={props.scan.verdict as Verdict} />
          </div>
          <p class="break-words text-12-regular text-text-strong">{props.scan.summary || "No summary available"}</p>
          <div class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-weak">
            <span>{formatDate(props.scan.createdAt)}</span>
          </div>
        </div>
        <div class="shrink-0 text-text-weak">
          <Icon
            name="chevron-down"
            size="small"
            class={`transition-transform duration-150 ${open() ? "rotate-0" : "-rotate-90"}`}
          />
        </div>
      </div>
      <Show when={open()}>
        {(() => {
          const perms = Object.entries(props.scan.permissions ?? {})
          return (
            <div class="space-y-2.5 px-3 pb-3 pt-1 text-12-regular text-text-weak">
              <div class="grid gap-2.5 rounded-lg bg-bg-muted p-2.5 sm:grid-cols-2">
                <div>
                  <div class="mb-0.5 text-xs text-text-weak/70">{language.t("store.scanResults.model")}</div>
                  <div class="text-text-strong">{props.scan.scanModel}</div>
                </div>
                <div>
                  <div class="mb-0.5 text-xs text-text-weak/70">{language.t("store.scanResults.trigger")}</div>
                  <div class="capitalize text-text-strong">{props.scan.triggerType}</div>
                </div>
                <div>
                  <div class="mb-0.5 text-xs text-text-weak/70">{language.t("store.scanResults.duration")}</div>
                  <div class="text-text-strong">{formatDuration(props.scan.durationMs)}</div>
                </div>
                <div>
                  <div class="mb-0.5 text-xs text-text-weak/70">Finished</div>
                  <div class="text-text-strong">{formatDate(props.scan.finishedAt)}</div>
                </div>
              </div>

              <div class="grid gap-2.5 lg:grid-cols-2">
                <div class="rounded-lg bg-bg-muted p-2.5">
                  <div class="mb-1 text-xs text-text-weak/70">{language.t("store.security.suggestions")}</div>
                  <Show
                    when={props.scan.recommendations.length > 0}
                    fallback={<div class="text-text-weak">{language.t("store.scanResults.noRecommendations")}</div>}
                  >
                    <ul class="space-y-1">
                      <For each={props.scan.recommendations}>
                        {(item) => <li class="break-words text-text-strong">{formatValue(item)}</li>}
                      </For>
                    </ul>
                  </Show>
                </div>

                <div class="rounded-lg bg-bg-muted p-2.5">
                  <div class="mb-1 text-xs text-text-weak/70">{language.t("store.security.foundIssues")}</div>
                  <Show
                    when={props.scan.redFlags.length > 0}
                    fallback={<div class="text-text-weak">{language.t("store.scanResults.noRedFlags")}</div>}
                  >
                    <ul class="space-y-1">
                      <For each={props.scan.redFlags}>
                        {(item) => <li class="break-words text-text-strong">{formatValue(item)}</li>}
                      </For>
                    </ul>
                  </Show>
                </div>
              </div>

              <Show when={perms.length > 0}>
                <div class="rounded-lg bg-bg-muted p-2.5">
                  <div class="mb-1 text-xs text-text-weak/70">{language.t("store.security.permissionNeeds")}</div>
                  <dl class="grid gap-2 sm:grid-cols-2">
                    <For each={perms}>
                      {(entry) => (
                        <div>
                          <dt class="text-xs text-text-weak/70">{entry[0]}</dt>
                          <dd class="mt-0.5 break-words text-text-strong">{formatValue(entry[1])}</dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </div>
              </Show>
            </div>
          )
        })()}
      </Show>
    </div>
  )
}

interface ItemDetailContentProps {
  itemId: string
  class?: string
  showBackButton?: boolean
  onBack?: () => void
  onItemLoaded?: (item: CapabilityItem) => void
  favorited?: boolean
  favoriteCount?: number
  previewCount?: number
  installCount?: number
  onToggleFavorite?: () => Promise<void>
  favoritePending?: boolean
  isAuthenticated?: boolean
}

export default function ItemDetailContent(props: ItemDetailContentProps) {
  const language = useLanguage()
  const theme = useTheme()
  const [item] = createResource(
    () => props.itemId,
    (id) => itemApi.get(id),
  )

  createEffect(() => {
    const data = item()
    if (data) props.onItemLoaded?.(data)
  })
  const [artifacts] = createResource(
    () => props.itemId,
    (id) => artifactApi.list(id).then((result) => result.artifacts),
  )
  const [scans] = createResource(
    () => props.itemId,
    (id) => scanApi.list(id).then((result) => result.results),
  )
  const [authorName] = createResource(
    () => item()?.createdBy,
    (createdBy) => userApi.getNames([createdBy]).then((names) => names[createdBy] ?? createdBy),
  )
  const [copied, setCopied] = createSignal(false)
  const [highlighted] = createResource(
    () => {
      const json = tryJson(item()?.content ?? "")
      if (!json) return null
      return { json, mode: theme.mode() === "light" ? "light" : "dark" } as const
    },
    (source) => highlight(source.json, source.mode),
  )

  const meta = () => TYPE_META[item()?.itemType ?? "skill"] ?? TYPE_META.skill

  const copy = async () => {
    if (!item()) return
    await navigator.clipboard.writeText(getInstallCommand(item()!))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Show when={!item.loading} fallback={<div class="flex justify-center py-16 text-text-weak">{language.t("store.loading")}</div>}>
      <Show
        when={item()}
        fallback={
          <div class="flex flex-col items-center justify-center gap-4 py-16">
            <p class="text-text-weak">{language.t("store.detail.notFound")}</p>
            <Show when={props.onBack && props.showBackButton}>
              <button onClick={props.onBack} class="text-12-regular text-text-weak transition-colors hover:text-text-strong">
                {language.t("store.detail.back")}
              </button>
            </Show>
          </div>
        }
      >
        {(data) => (
          <div class={`detail-panel flex h-full flex-col ${props.class ?? ""}`.trim()}>
            {/* Sticky header */}
            <div class="detail-panel-header sticky top-0 z-10 bg-inherit px-5 pb-4 pr-12 pt-5">
              <Show when={props.onBack && props.showBackButton}>
                <button
                  onClick={props.onBack}
                  class="mb-3 inline-flex cursor-pointer items-center gap-1 text-12-regular text-text-weak transition-colors duration-150 hover:text-text-strong"
                >
                  <Icon name="chevron-left" size="small" />
                  {language.t("store.detail.back")}
                </button>
              </Show>

              <div class="flex items-start justify-between gap-3">
                <h1
                  class="min-w-0 font-bold text-text-strong"
                  style={{ "font-size": "20px", "letter-spacing": "-0.02em", "line-height": "1.3" }}
                >
                  {data().name}
                </h1>
                <div class="flex items-center gap-1.5 shrink-0">
                  <Show when={data().sourceType === "archive"}>
                    <span
                      class="mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs"
                      style={{ "background-color": "rgba(59,130,246,0.12)", color: "rgb(59,130,246)" }}
                      title={language.t("store.sourceType.archive")}
                    >
                      <Icon name="cloud-upload" size="small" />
                    </span>
                  </Show>
                  <Show when={props.onToggleFavorite}>
                    <button
                      onClick={() => void props.onToggleFavorite?.()}
                      disabled={!props.isAuthenticated || props.favoritePending}
                      class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                      classList={{
                        "bg-bg-muted text-text-strong hover:bg-bg-muted/70": props.favorited,
                        "text-text-weak hover:text-text-strong hover:bg-bg-muted": !props.favorited,
                      }}
                      title={
                        props.isAuthenticated
                          ? props.favorited
                            ? language.t("store.detail.unfavorite")
                            : language.t("store.detail.favorite")
                          : language.t("store.detail.favoriteSignIn")
                      }
                    >
                      <span class="inline-flex items-center" style={{ width: "14px", height: "14px" }}><LocalIcon name={props.favorited ? "star-filled" : "star"} size="small" style={{ color: props.favorited ? (TYPE_META[item()?.itemType ?? ""]?.accent ?? "var(--st-accent)") : undefined, width: "14px", height: "14px" }} /></span>
                      <span>
                        {props.isAuthenticated
                          ? props.favorited
                            ? language.t("store.detail.favorited")
                            : language.t("store.detail.favorite")
                          : language.t("store.detail.favoriteSignIn")}
                      </span>
                    </button>
                  </Show>
                </div>
              </div>

              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  class="inline-flex items-center rounded-[10px] px-2.5 py-[2px] text-xs font-medium"
                  style={{
                    "background-color": `color-mix(in srgb, ${meta().accent} 12%, transparent)`,
                    color: meta().accent,
                  }}
                >
                  {language.t("store.capability.type." + (item()?.itemType ?? "skill"))}
                </span>
                <Show when={data().category}>
                  <span class="inline-flex items-center rounded-[10px] bg-[rgba(156,163,175,0.12)] px-2.5 py-[2px] text-xs font-medium text-text-weak">
                    {language.t(categoryKey(data().category))}
                  </span>
                </Show>
                <SecurityTag status={data().securityStatus} />
              </div>
            </div>

            {/* Scrollable body */}
            <div class="detail-panel-body flex-1 px-5">
              {/* Description + Install command */}
              <div>
                <Show when={data().description}>
                  <p class="mb-3 text-12-regular leading-relaxed text-text-weak">{data().description}</p>
                </Show>
                <div class="flex items-center gap-2 rounded-lg px-4 py-2.5" style="background-color: var(--st-surface-high)">
                  <div class="thin-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
                    <code class="select-all whitespace-nowrap text-12-mono text-text-weak">{getInstallCommand(data())}</code>
                  </div>
                  <button
                    onClick={copy}
                    class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-weak transition-all duration-150 hover:bg-bg-muted hover:text-text-strong"
                    title={language.t("store.itemCard.copyInstall")}
                  >
                    <Icon name={copied() ? "check-small" : "copy"} size="small" class={copied() ? "text-green-500" : ""} />
                  </button>
                </div>
              </div>

              {/* Content section */}
              <Show when={data().content}>
                <div class="pt-5">
                  <h2 class="mb-2 text-14-medium text-text-strong">{language.t("store.capabilityDialog.field.content")}</h2>
                  <Show
                    when={highlighted()}
                    fallback={
                      <div class="thin-scrollbar max-h-[400px] overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 p-4 text-14-regular leading-7">
                        {renderMd(data().content)}
                      </div>
                    }
                  >
                    <div
                      class="thin-scrollbar max-h-[400px] overflow-x-auto overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 p-4 text-12-mono leading-6 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0"
                      innerHTML={highlighted()}
                    />
                  </Show>
                </div>
              </Show>

              {/* Artifacts section */}
              <Show when={(artifacts() ?? []).length > 0}>
                <div class="pt-5">
                  <h2 class="mb-2 text-14-medium text-text-strong">{language.t("store.detail.artifacts")}</h2>
                  <div class="overflow-hidden rounded-lg border border-border-weak-base">
                    <For each={artifacts() ?? []}>
                      {(artifact) => (
                        <div class="flex items-center justify-between gap-3 border-b border-border-weak-base px-3 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-bg-muted/40">
                          <div class="min-w-0">
                            <div class="flex items-center gap-2">
                              <span class="truncate text-12-medium text-text-strong">{artifact.filename}</span>
                              <Show when={artifact.isLatest}>
                                <span
                                  class="inline-flex items-center rounded-[10px] px-2 py-[1px] text-xs font-medium"
                                  style={{
                                    "background-color": `color-mix(in srgb, ${meta().accent} 12%, transparent)`,
                                    color: meta().accent,
                                  }}
                                >
                                  {language.t("store.detail.latest")}
                                </span>
                              </Show>
                            </div>
                            <div class="mt-0.5 text-xs text-text-weak">
                              {artifact.version ? `v${artifact.version} · ` : ""}
                              {formatBytes(artifact.fileSize)}
                            </div>
                          </div>
                          <a
                            href={artifactApi.downloadUrl(artifact.id)}
                            download=""
                            class="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-12-medium text-text-weak transition-all duration-150 hover:bg-bg-muted hover:text-text-strong"
                          >
                            <Icon name="download" size="small" />
                            {language.t("store.itemCard.download")}
                          </a>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Details section */}
              <div class="pt-5">
                <h2 class="mb-2 text-14-medium text-text-strong">{language.t("store.detail.details")}</h2>
                <div class="overflow-hidden rounded-lg border border-border-weak-base">
                  <dl>
                    <For
                      each={[
                        [language.t("store.console.capabilities.type"), language.t("store.capability.type." + (data().itemType ?? "skill"))],
                        [
                          language.t("store.console.capabilities.visibility"),
                          data().repoVisibility === "public"
                            ? language.t("store.capability.visibility.public")
                            : data().repoVisibility === "private"
                              ? language.t("store.capability.visibility.private")
                              : "-",
                        ],
                        ...(authorName() ? [[language.t("store.detail.author"), authorName()]] : []),
                        [language.t("store.detail.created"), formatDate(data().createdAt)],
                        [language.t("store.detail.updated"), formatDate(data().updatedAt)],
                        [language.t("store.detail.previewCount"), String(props.previewCount ?? data().previewCount ?? 0)],
                        [language.t("store.detail.installCount"), String(props.installCount ?? data().installCount ?? 0)],
                        [language.t("store.detail.favoriteCount"), String(props.favoriteCount ?? data().favoriteCount ?? 0)],
                      ] as [string, string][]}
                    >
                      {(row) => (
                        <div class="flex items-center justify-between border-b border-border-weak-base px-4 py-2.5 last:border-b-0">
                          <dt class="text-12-regular text-text-weak">{row[0]}</dt>
                          <dd class="text-12-medium text-text-strong">{row[1]}</dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </div>
              </div>

              {/* Security scans section */}
              <Show when={(scans() ?? []).length > 0}>
                <div class="pt-5 pb-4">
                  <h2 class="mb-2 text-14-medium text-text-strong">{language.t("store.scanResults.securityScan")}</h2>
                  <div class="space-y-2">
                    <For each={scans() ?? []}>{(scan) => <ScanRow scan={scan} />}</For>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Show>
  )
}
