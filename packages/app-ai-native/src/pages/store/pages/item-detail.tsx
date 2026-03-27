import { createResource, createSignal, Show, For } from "solid-js"
import { createHighlighter } from "shiki"
import { useTheme } from "@opencode-ai/ui/theme"
import { useParams, useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { itemApi, artifactApi, scanApi, userApi, type CapabilityItem, type ScanResult } from "../lib/api"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { categoryKey, formatBytes } from "../lib/constants"
import SecurityTag, { VerdictTag, type Verdict } from "../components/security-tag"

const TYPE_META: Record<string, { accent: string; back: string; label: string }> = {
  skill: { accent: "rgb(234,179,8)", back: "/store/skills", label: "store.sidebar.nav.skills" },
  subagent: { accent: "rgb(59,130,246)", back: "/store/subagents", label: "store.sidebar.nav.subagents" },
  command: { accent: "rgb(34,197,94)", back: "/store/commands", label: "store.sidebar.nav.commands" },
  mcp: { accent: "rgb(168,85,247)", back: "/store/mcp-servers", label: "store.sidebar.nav.mcpServers" },
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

function installCmd(item: CapabilityItem) {
  const registry = item.registry?.name || "public"
  return `cs plugin add ${item.itemType} ${registry}/${item.slug}`
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

const THEMES = { light: "github-light", dark: "github-dark" } as const

let _highlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined

async function highlight(json: string, mode: "light" | "dark") {
  if (!_highlighter) _highlighter = await createHighlighter({ themes: [THEMES.light, THEMES.dark], langs: ["json"] })
  return _highlighter.codeToHtml(json, { lang: "json", theme: THEMES[mode] })
}

function renderMd(content: string) {
  return content.split("\n").map((line) => {
    if (line.startsWith("# ")) return <h1 class="text-20-medium text-text-strong mt-6 mb-3">{line.slice(2)}</h1>
    if (line.startsWith("## ")) return <h2 class="text-16-medium text-text-strong mt-5 mb-2">{line.slice(3)}</h2>
    if (line.startsWith("### ")) return <h3 class="text-14-medium text-text-strong mt-4 mb-2">{line.slice(4)}</h3>
    if (line.startsWith("- ")) return <li class="ml-5 list-disc mb-1 text-text-weak">{line.slice(2)}</li>
    if (/^\d+\. /.test(line))
      return <li class="ml-5 list-decimal mb-1 text-text-weak">{line.replace(/^\d+\. /, "")}</li>
    if (line.startsWith("```")) return <div class="text-12-mono bg-bg-muted px-3 py-1.5 rounded my-2">{line}</div>
    if (line.trim()) return <p class="mb-2 leading-relaxed text-text-weak">{line}</p>
    return <br />
  })
}

function ScanRow(props: { scan: ScanResult }) {
  const [open, setOpen] = createSignal(false)
  const language = useLanguage()

  return (
    <div class="rounded-lg border border-border-weak-base">
      <div
        onClick={() => setOpen((v) => !v)}
        class="flex w-full cursor-pointer items-center gap-4 px-4 py-3 transition hover:bg-bg-muted/50"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <SecurityTag status={props.scan.riskLevel as any} />
            <VerdictTag verdict={props.scan.verdict as Verdict} />
          </div>
          <p class="text-12-regular text-text-strong">{props.scan.summary || "No summary available"}</p>
          <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-text-weak">
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
            <div class="space-y-3 px-4 pb-4 pt-1 text-12-regular text-text-weak">
              <div class="grid gap-3 rounded-lg bg-bg-muted p-3 sm:grid-cols-2">
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

              <div class="grid gap-3 lg:grid-cols-2">
                <div class="rounded-lg bg-bg-muted p-3">
                  <div class="mb-1.5 text-xs text-text-weak/70">{language.t("store.security.suggestions")}</div>
                  <Show
                    when={props.scan.recommendations.length > 0}
                    fallback={<div class="text-text-weak">{language.t("store.scanResults.noRecommendations")}</div>}
                  >
                    <ul class="space-y-1.5">
                      <For each={props.scan.recommendations}>
                        {(item) => <li class="text-text-strong">{formatValue(item)}</li>}
                      </For>
                    </ul>
                  </Show>
                </div>

                <div class="rounded-lg bg-bg-muted p-3">
                  <div class="mb-1.5 text-xs text-text-weak/70">{language.t("store.security.foundIssues")}</div>
                  <Show
                    when={props.scan.redFlags.length > 0}
                    fallback={<div class="text-text-weak">{language.t("store.scanResults.noRedFlags")}</div>}
                  >
                    <ul class="space-y-1.5">
                      <For each={props.scan.redFlags}>
                        {(item) => <li class="text-text-strong">{formatValue(item)}</li>}
                      </For>
                    </ul>
                  </Show>
                </div>
              </div>

              <Show when={perms.length > 0}>
                <div class="rounded-lg bg-bg-muted p-3">
                  <div class="mb-1.5 text-xs text-text-weak/70">{language.t("store.security.permissionNeeds")}</div>
                  <dl class="grid gap-2 sm:grid-cols-2">
                    <For each={perms}>
                      {(entry) => (
                        <div>
                          <dt class="text-xs text-text-weak/70">{entry[0]}</dt>
                          <dd class="mt-0.5 text-text-strong">{formatValue(entry[1])}</dd>
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

export default function ItemDetail() {
  const language = useLanguage()
  const theme = useTheme()
  const auth = useAuth()
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item] = createResource(
    () => params.id,
    (id) => itemApi.get(id),
  )
  const [artifacts] = createResource(
    () => params.id,
    (id) => artifactApi.list(id).then((r) => r.artifacts),
  )
  const [scans] = createResource(
    () => params.id,
    (id) => scanApi.list(id).then((r) => r.results),
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
      return { json, mode: theme.mode() } as const
    },
    (src) => highlight(src.json, src.mode),
  )

  const meta = () => TYPE_META[item()?.itemType ?? "skill"] ?? TYPE_META.skill

  const copy = async () => {
    if (!item()) return
    await navigator.clipboard.writeText(installCmd(item()!))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Show
      when={!item.loading}
      fallback={<div class="flex justify-center py-16 text-text-weak">{language.t("store.loading")}</div>}
    >
      <Show
        when={item()}
        fallback={
          <div class="flex flex-col items-center justify-center py-16 gap-4">
            <p class="text-text-weak">{language.t("store.detail.notFound")}</p>
            <button onClick={() => navigate(-1)} class="text-12-regular text-text-weak hover:text-text-strong">
              {language.t("store.detail.back")}
            </button>
          </div>
        }
      >
        {(data) => (
          <div class="px-8 py-8 w-full max-w-3xl mx-auto">
            <button
              onClick={() => navigate(meta().back)}
              class="inline-flex items-center gap-1 text-12-regular text-text-weak cursor-pointer hover:text-text-strong transition-colors duration-150 mb-6"
            >
              <Icon name="chevron-left" size="small" />
              {language.t("store.detail.back")}
            </button>

            {/* Hero */}
            <div class="mb-8">
              <div class="rounded-lg overflow-hidden border border-border-weak-base">
                <div class="px-5 pt-5 pb-4 bg-bg-muted/50">
                  <div class="flex items-start justify-between gap-4 mb-3">
                    <h1
                      class="font-bold text-text-strong"
                      style={{ "font-size": "24px", "letter-spacing": "-0.02em", "line-height": "1.3" }}
                    >
                      {data().name}
                    </h1>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <Show when={data().sourceType === "archive"}>
                        <span
                          class="text-xs px-1.5 py-0.5 rounded inline-flex items-center"
                          style={{ "background-color": "rgba(59,130,246,0.12)", color: "rgb(59,130,246)" }}
                          title={language.t("store.sourceType.archive")}
                        >
                          <Icon name="cloud-upload" size="small" />
                        </span>
                      </Show>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 mb-3">
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
                      <span
                        class="inline-flex items-center rounded-[10px] px-2.5 py-[2px] text-xs font-medium text-text-weak"
                        style={{ "background-color": "rgba(156,163,175,0.12)" }}
                      >
                        {language.t(categoryKey(data().category))}
                      </span>
                    </Show>
                    <SecurityTag status={data().securityStatus} />
                  </div>

                  <Show when={data().description}>
                    <p class="text-12-regular text-text-weak leading-relaxed">{data().description}</p>
                  </Show>
                </div>

                {/* Install command — integrated into hero card */}
                <div class="flex items-center gap-3 px-5 py-3 border-t border-border-weak-base bg-bg-muted/30">
                  <div class="min-w-0 flex-1">
                    <code class="text-12-mono text-text-weak select-all">{installCmd(data())}</code>
                  </div>
                  <button
                    onClick={copy}
                    class="inline-flex items-center justify-center size-7 rounded text-text-weak cursor-pointer hover:text-text-strong hover:bg-bg-muted transition-all duration-150 shrink-0"
                    title={language.t("store.itemCard.copyInstall")}
                  >
                    <Icon
                      name={copied() ? "check-small" : "copy"}
                      size="small"
                      class={copied() ? "text-green-500" : ""}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div class="space-y-8">
              <Show when={data().content}>
                <section>
                  <h2 class="text-16-medium text-text-strong mb-3">
                    {language.t("store.capabilityDialog.field.content")}
                  </h2>
                  <Show
                    when={highlighted()}
                    fallback={
                      <div class="rounded-lg bg-bg-muted/50 border border-border-weak-base p-5 text-14-regular leading-7 max-h-[480px] overflow-y-auto thin-scrollbar">
                        {renderMd(data().content)}
                      </div>
                    }
                  >
                    <div
                      class="rounded-lg bg-bg-muted/50 border border-border-weak-base p-5 text-12-mono leading-6 max-h-[480px] overflow-y-auto overflow-x-auto thin-scrollbar [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0"
                      innerHTML={highlighted()}
                    />
                  </Show>
                </section>
              </Show>

              <Show when={(artifacts() ?? []).length > 0}>
                <section>
                  <h2 class="text-16-medium text-text-strong mb-3">{language.t("store.detail.artifacts")}</h2>
                  <div class="rounded-lg border border-border-weak-base overflow-hidden">
                    <For each={artifacts() ?? []}>
                      {(artifact) => (
                        <div class="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-weak-base last:border-b-0 hover:bg-bg-muted/40 transition-colors duration-150">
                          <div class="min-w-0">
                            <div class="flex items-center gap-2">
                              <span class="text-14-medium truncate text-text-strong">{artifact.filename}</span>
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
                            <div class="text-12-regular text-text-weak mt-0.5">
                              {artifact.version ? `v${artifact.version} · ` : ""}
                              {formatBytes(artifact.fileSize)}
                            </div>
                          </div>
                          <a
                            href={artifactApi.downloadUrl(artifact.id)}
                            download=""
                            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-12-medium rounded-lg cursor-pointer transition-all duration-150 text-text-weak hover:text-text-strong hover:bg-bg-muted"
                          >
                            <Icon name="download" size="small" />
                            {language.t("store.itemCard.download")}
                          </a>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <section>
                <h2 class="text-16-medium text-text-strong mb-3">{language.t("store.detail.details")}</h2>
                <div class="rounded-lg border border-border-weak-base overflow-hidden">
                  <dl>
                    <For
                      each={
                        [
                          [
                            language.t("store.console.capabilities.type"),
                            language.t("store.capability.type." + (data().itemType ?? "skill")),
                          ],
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
                        ] as [string, string][]
                      }
                    >
                      {(row) => (
                        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border-weak-base last:border-b-0">
                          <dt class="text-12-regular text-text-weak">{row[0]}</dt>
                          <dd class="text-12-medium text-text-strong">{row[1]}</dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </div>
              </section>

              <Show when={(scans() ?? []).length > 0}>
                <section>
                  <h2 class="text-16-medium text-text-strong mb-3">{language.t("store.scanResults.securityScan")}</h2>
                  <div class="space-y-2">
                    <For each={scans() ?? []}>{(scan) => <ScanRow scan={scan} />}</For>
                  </div>
                </section>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Show>
  )
}
