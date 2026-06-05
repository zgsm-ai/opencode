import { createResource, createSignal, createEffect, Show, For } from "solid-js"
import { createHighlighter } from "shiki"
import QRCode from "qrcode"
import { useTheme } from "@opencode-ai/ui/theme"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/ui/markdown"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LocalIcon } from "@/components/local-icon"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useAuth } from "@/context/auth"
import { useNavigate } from "@solidjs/router"
import { env } from "@/lib/env"
import { itemApi, userApi, type CapabilityItem } from "../lib/api"
import { useLanguage } from "@/context/language"
import { pickItemDescription } from "../lib/item-description"
import SecurityTag from "./security-tag"
import HealthRadar from "./health-radar"
import { DistributeDialog } from "./distribute-dialog"
import { BuiltinContentDialog } from "./builtin-content-dialog"
import { McpConfigForm } from "./mcp-config-form"
import { detectMcpFields } from "../lib/mcp-config"
import type { McpConfigStatus } from "../lib/api"
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

const EVAL_DIMS = [
  "coding_relevance",
  "doc_completeness",
  "desc_accuracy",
  "writing_quality",
  "specificity",
  "install_clarity",
] as const

// Upstream rubric weights (ai-resource-eval/governor.py). Sum to 1.0 over all 6 dims.
const EVAL_DIM_WEIGHTS: Record<(typeof EVAL_DIMS)[number], number> = {
  coding_relevance: 0.25,
  doc_completeness: 0.2,
  desc_accuracy: 0.15,
  writing_quality: 0.15,
  specificity: 0.15,
  install_clarity: 0.1,
}

// Content-quality subtotal (0-100): Σ (dim/5 * 100 * weight) over the dims present,
// renormalizing weights across present dims so they still sum to 1. Returns null if no dims.
function computeContentQuality(evaluation: NonNullable<CapabilityItem["evaluation"]>): number | null {
  let weightSum = 0
  let weighted = 0
  for (const dim of EVAL_DIMS) {
    const val = evaluation[dim]
    if (val == null) continue
    const weight = EVAL_DIM_WEIGHTS[dim]
    weightSum += weight
    weighted += (val / 5) * 100 * weight
  }
  if (weightSum === 0) return null
  return Math.round(weighted / weightSum)
}

function hasHealthSignals(health?: CapabilityItem["health"]) {
  const s = health?.signals
  return !!s && (s.freshness != null || s.popularity != null || s.source_trust != null)
}

function hasEvaluation(e?: CapabilityItem["evaluation"]) {
  if (!e) return false
  return (
    (e.final_score != null && e.final_score > 0) ||
    e.coding_relevance != null ||
    e.doc_completeness != null ||
    e.desc_accuracy != null ||
    e.writing_quality != null ||
    e.specificity != null ||
    e.install_clarity != null
  )
}

// Long uuid-style ids get a distinctive 12-char prefix (no mid-truncation ellipsis);
// short ids (e.g. "system") are shown as-is.
const shortId = (id: string) => (id.length <= 16 ? id : id.slice(0, 12))

const THEMES = { light: "light-plus", dark: "dark-plus" } as const
const TAG_COLOR_BY_CLASS = {
  system: {
    color: "#e17a0c",
    background: "#f9a02c1a",
  },
  custom: {
    color: "#478be6",
    background: "#4184e41a",
  },
} as const

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | undefined

export function getInstallCommand(item: CapabilityItem) {
  // Prefer metadata.install for plugin items (e.g. zip_download instructions)
  const install = (item.metadata as Record<string, any> | undefined)?.install
  if (install?.method === "zip_download" && Array.isArray(install.commands)) {
    return install.commands.join("\n")
  }
  const registry = item.repoName || "public"
  return `cs plugin add ${item.itemType} ${registry}/${item.slug}`
}

function formatDate(iso: string, locale?: string) {
  const normalizedLocale = locale?.startsWith("zh") ? "zh-CN" : "en-US"
  return new Intl.DateTimeFormat(normalizedLocale, {
    year: "numeric",
    month: normalizedLocale === "zh-CN" ? "long" : "short",
    day: "numeric",
  }).format(new Date(iso))
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

function formatCompactCount(value: number) {
  if (value >= 1000000) {
    const next = (value / 1000000).toFixed(value >= 10000000 ? 0 : 1)
    return `${next.replace(/\.0$/, "")}M`
  }
  if (value >= 1000) {
    const next = (value / 1000).toFixed(value >= 10000 ? 0 : 1)
    return `${next.replace(/\.0$/, "")}k`
  }
  return String(value)
}

function compareTags(a: { tagClass?: string; slug: string }, b: { tagClass?: string; slug: string }) {
  const aPriority = a.tagClass === "system" ? 0 : 1
  const bPriority = b.tagClass === "system" ? 0 : 1
  if (aPriority !== bPriority) return aPriority - bPriority
  return a.slug.localeCompare(b.slug, undefined, { sensitivity: "base" })
}

function tagStyle(tagClass?: string) {
  const accent = tagClass === "system" ? TAG_COLOR_BY_CLASS.system : TAG_COLOR_BY_CLASS.custom
  return {
    color: accent.color,
    "background-color": `color-mix(in srgb, ${accent.color} 14%, var(--native-panel))`,
  }
}

function VisibilityIcon(props: { visibility?: string }) {
  return (
    <span class="inline-flex items-center text-text-weak" aria-hidden="true">
      <Show
        when={props.visibility === "private"}
        fallback={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a15 15 0 0 1 0 18" />
            <path d="M12 3a15 15 0 0 0 0 18" />
          </svg>
        }
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-4"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      </Show>
    </span>
  )
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

function ShareButton(props: { itemId: string; itemName: string }) {
  const language = useLanguage()
  const [qrDataUrl, setQrDataUrl] = createSignal("")
  const [copied, setCopied] = createSignal(false)

  const shareUrl = () => {
    const base = env.MOBILE_HOST.replace(/\/+$/, "")
    const path = (env.BASE_PATH || "").replace(/\/+$/, "")
    return `${base}${path}/m/store/${props.itemId}`
  }

  createEffect(() => {
    QRCode.toDataURL(shareUrl(), { width: 160, margin: 1, color: { dark: "#1e293b" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
  })

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Popover>
      <PopoverTrigger
        as="button"
        class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
        title={language.t("store.detail.share")}
      >
        <Icon name="share" size="small" />
        <span>{language.t("store.detail.share")}</span>
      </PopoverTrigger>
      <PopoverContent class="w-[240px] rounded-xl border border-border-weak-base bg-[var(--native-panel)] p-4 shadow-lg">
        <div class="flex flex-col items-center gap-3">
          <Show when={qrDataUrl()}>
            <img src={qrDataUrl()} alt="QR Code" class="h-[140px] w-[140px] rounded-lg" />
          </Show>
          <span class="text-xs text-text-weak">{language.t("store.detail.share.qrcode")}</span>
          <button
            onClick={() => void copy()}
            class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-2 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
          >
            <Icon name={copied() ? "check" : "link"} size="small" />
            <span>{copied() ? language.t("store.detail.share.copied") : language.t("store.detail.share.copyLink")}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
  const itemFilterOptions = useItemFilterOptions()
  const auth = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()
  const dialog = useDialog()
  const [item, { mutate: mutateItem, refetch: refetchItem }] = createResource(
    () => props.itemId,
    (id) => itemApi.get(id),
  )

  createEffect(() => {
    const data = item()
    if (data) props.onItemLoaded?.(data)
  })
  const [authorName] = createResource(
    () => item()?.createdBy,
    (createdBy) => userApi.getNames([createdBy]).then((names) => names[createdBy] ?? createdBy),
  )
  const [authorInfo] = createResource(
    () => item()?.createdBy,
    async (createdBy) => {
      if (!createdBy) return null
      const info = await userApi.getInfo([createdBy]).catch(() => ({}))
      return info[createdBy] ?? null
    },
  )
  // 「Forked from xxx」中 xxx = 原作者名，复用与 createdBy 相同的解析链路。
  const [forkedFromName] = createResource(
    () => item()?.forkedFromOwnerId,
    (ownerId) => userApi.getNames([ownerId]).then((names) => names[ownerId] ?? ownerId),
  )
  const [copied, setCopied] = createSignal(false)
  const [idCopied, setIdCopied] = createSignal(false)
  const [highlighted] = createResource(
    () => {
      const json = tryJson(item()?.content ?? "")
      if (!json) return null
      return { json, mode: theme.mode() === "light" ? "light" : "dark" } as const
    },
    (source) => highlight(source.json, source.mode),
  )

  const meta = () => TYPE_META[item()?.itemType ?? "skill"] ?? TYPE_META.skill
  const canEditItem = () => !!item() && !!auth.user() && item()!.createdBy === auth.user()!.id

  // MCP per-user config gating. Detected placeholder fields come from the normalized template
  // `metadata`; whether each is filled comes from the masked `mcpConfig` status (merged with a
  // just-saved override). When an MCP item has fillable placeholders, subscribe is gated until
  // every required field has a value. Non-MCP items / MCP without placeholders are unaffected.
  const [mcpStatusOverride, setMcpStatusOverride] = createSignal<McpConfigStatus | null>(null)
  const mcpFields = () =>
    item()?.itemType === "mcp" ? detectMcpFields(item()?.metadata as Record<string, unknown> | undefined) : []
  const mcpHasFields = () => mcpFields().length > 0
  const mcpStatus = () => mcpStatusOverride() ?? item()?.mcpConfig ?? null
  const mcpHasValueByKey = () => {
    const map: Record<string, boolean> = {}
    for (const f of mcpStatus()?.fields ?? []) map[f.key] = f.hasValue
    return map
  }
  const mcpConfigComplete = () => {
    if (!mcpHasFields()) return true
    const filled = mcpHasValueByKey()
    return mcpFields()
      .filter((f) => f.required)
      .every((f) => filled[f.key])
  }
  // Subscribe is blocked only for an MCP item that still has unfilled required placeholders.
  const mcpGateBlocks = () => mcpHasFields() && !mcpConfigComplete()

  // Called by the inline config form after a successful save: reflect the new masked status
  // immediately (re-gates the subscribe button), then refetch so the per-user-resolved
  // `content` preview and any other server-derived state refresh.
  const onMcpSaved = (status: McpConfigStatus) => {
    setMcpStatusOverride(status)
    mutateItem((prev) => (prev ? { ...prev, mcpConfig: status } : prev))
    void refetchItem()
  }
  const canDistributeItem = () =>
    !!item() &&
    !!auth.user() &&
    (auth.user()!.systemRoles ?? []).includes("platform_admin")

  const copy = async () => {
    if (!item()) return
    await navigator.clipboard.writeText(getInstallCommand(item()!))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyAuthorId = async (id: string) => {
    await navigator.clipboard.writeText(id)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 1500)
  }

  // Fork 仅对公共、非 archive 且非本人创建的 item 可用。
  const canForkItem = () =>
    !!item() && !canEditItem() && item()!.repoVisibility === "public" && item()!.sourceType !== "archive"

  const [forking, setForking] = createSignal(false)
  // Fork 按钮三态：已有我的 fork → 跳转查看；否则 fork；未登录禁用。
  const doFork = async () => {
    const data = item()
    if (!data || forking()) return
    if (data.myForkItemId) {
      navigate(`/capabilities/${data.myForkItemId}/edit`)
      return
    }
    setForking(true)
    try {
      const forked = await itemApi.fork(data.id)
      showToast({ title: language.t("store.detail.forkSuccess") })
      navigate(`/capabilities/${forked.id}/edit`)
    } catch (err) {
      showToast({
        title: language.t("store.detail.forkFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setForking(false)
    }
  }

  return (
    <Show
      when={!item.loading}
      fallback={<div class="flex justify-center py-16 text-text-weak">{language.t("store.loading")}</div>}
    >
      <Show
        when={item()}
        fallback={
          <div class="flex flex-col items-center justify-center gap-4 py-16">
            <p class="text-text-weak">{language.t("store.detail.notFound")}</p>
            <Show when={props.onBack && props.showBackButton}>
              <button
                onClick={props.onBack}
                class="text-12-regular text-text-weak transition-colors hover:text-text-strong"
              >
                {language.t("store.detail.back")}
              </button>
            </Show>
          </div>
        }
      >
        {(data) => (
          <div class={`detail-panel flex h-full flex-col ${props.class ?? ""}`.trim()}>
            <div class="detail-panel-header border-b border-border-weak-base px-6 pb-5 pr-14 pt-6">
              <Show when={props.onBack && props.showBackButton}>
                <button
                  onClick={props.onBack}
                  class="mb-3 inline-flex cursor-pointer items-center gap-1 text-12-regular text-text-weak transition-colors duration-150 hover:text-text-strong"
                >
                  <Icon name="chevron-left" size="small" />
                  {language.t("store.detail.back")}
                </button>
              </Show>

              <div class="space-y-3">
                <div class="flex items-start justify-between gap-6">
                  <div class="min-w-0 flex flex-1 items-center gap-3">
                    <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)]"
                      style={{ "background-color": meta().bg, color: meta().accent }}
                    >
                      <Icon name={meta().icon} />
                    </div>
                    <h1
                      class="min-w-0 text-text-strong"
                      style={{ "font-size": "24px", "letter-spacing": "-0.02em", "line-height": "1.25" }}
                    >
                      {data().name}
                    </h1>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5 self-start">
                    <Show when={data().sourceType === "archive"}>
                      <span
                        class="mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs"
                        style={{ "background-color": "color-mix(in srgb, rgb(59,130,246) 14%, var(--native-panel))", color: "rgb(59,130,246)" }}
                        title={language.t("store.sourceType.archive")}
                      >
                        <Icon name="cloud-upload" size="small" />
                      </span>
                    </Show>
                    <Show when={canEditItem()}>
                      <button
                        onClick={() => navigate(`/capabilities/${data().id}/edit`)}
                        class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
                        title={language.t("common.edit")}
                      >
                        <Icon name="edit" size="small" />
                        <span>{language.t("common.edit")}</span>
                      </button>
                    </Show>
                    <Show when={props.onToggleFavorite}>
                      <button
                        onClick={() => void props.onToggleFavorite?.()}
                        disabled={!props.isAuthenticated || props.favoritePending || mcpGateBlocks()}
                        class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                        classList={{
                          "bg-bg-muted text-text-strong hover:bg-bg-muted/70": props.favorited,
                          "text-text-weak hover:text-text-strong hover:bg-bg-muted": !props.favorited,
                        }}
                        title={
                          !props.isAuthenticated
                            ? language.t("store.detail.favoriteSignInTooltip")
                            : mcpGateBlocks()
                              ? language.t("store.detail.mcpConfig.gateReason")
                              : props.favorited
                                ? language.t("store.detail.unfavoriteTooltip")
                                : language.t("store.detail.favoriteTooltip")
                        }
                      >
                        <span class="inline-flex items-center" style={{ width: "14px", height: "14px" }}>
                          <LocalIcon
                            name={props.favorited ? "subscribe-filled" : "subscribe"}
                            size="small"
                            style={{
                              color: props.favorited
                                ? (TYPE_META[item()?.itemType ?? ""]?.accent ?? "var(--native-primary)")
                                : undefined,
                              width: "14px",
                              height: "14px",
                            }}
                          />
                        </span>
                        <span>
                          {props.isAuthenticated
                            ? props.favorited
                              ? language.t("store.detail.favorited")
                              : language.t("store.detail.favorite")
                            : language.t("store.detail.favoriteSignIn")}
                        </span>
                      </button>
                    </Show>
                    <Show when={canForkItem()}>
                      <button
                        onClick={() => void doFork()}
                        disabled={!props.isAuthenticated || forking()}
                        class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60"
                        title={
                          !props.isAuthenticated
                            ? language.t("store.detail.forkSignInTooltip")
                            : data().myForkItemId
                              ? language.t("store.detail.viewMyForkTooltip")
                              : language.t("store.detail.forkTooltip")
                        }
                      >
                        <LocalIcon name="fork" size="small" style={{ width: "14px", height: "14px" }} />
                        <span>
                          {data().myForkItemId
                            ? language.t("store.detail.viewMyFork")
                            : language.t("store.detail.fork")}
                        </span>
                      </button>
                    </Show>
                    <ShareButton itemId={data().id} itemName={data().name} />
                    <Show when={canDistributeItem()}>
                      <Show when={data().itemType === "plugin"}>
                        <button
                          onClick={async () => {
                            const next = !data().isBuiltIn
                            // 取消内置：直接更新
                            if (!next) {
                              try {
                                await itemApi.update(data().id, { isBuiltIn: false })
                                mutateItem((prev) => (prev ? { ...prev, isBuiltIn: false } : prev))
                                showToast({
                                  variant: "success",
                                  title: language.t("store.detail.unsetBuiltInSuccess") || "已取消内置 Plugin",
                                })
                              } catch (err) {
                                showToast({
                                  variant: "error",
                                  title: language.t("store.detail.toggleBuiltInFailed") || "设置失败",
                                  description: err instanceof Error ? err.message : String(err),
                                })
                              }
                              return
                            }
                            // 设为内置：弹窗上传 Markdown 内容
                            dialog.show(() => (
                              <BuiltinContentDialog
                                itemId={data().id}
                                itemName={data().name}
                                onSuccess={(updatedItem) => {
                                  mutateItem((prev) => (prev ? { ...prev, ...updatedItem } : prev))
                                }}
                              />
                            ))
                          }}
                          class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
                          title={data().isBuiltIn ? "取消内置 Plugin" : "设为内置 Plugin"}
                        >
                          <LocalIcon name={data().isBuiltIn ? "star-filled" : "star"} size="small" />
                          <span>{data().isBuiltIn ? "取消内置" : "设为内置"}</span>
                        </button>
                      </Show>
                      <button
                        onClick={() =>
                          dialog.show(() => (
                            <DistributeDialog
                              itemId={data().id}
                              itemName={data().name}
                            />
                          ))
                        }
                        class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
                        title={language.t("store.distribute.tooltip")}
                      >
                        <LocalIcon name="send" size="small" />
                        <span>{language.t("store.distribute.button")}</span>
                      </button>
                    </Show>
                  </div>
                </div>
                <Show when={props.onToggleFavorite && props.isAuthenticated && mcpGateBlocks()}>
                  <p class="text-right text-12-regular text-text-weak">
                    {language.t("store.detail.mcpConfig.gateHint")}
                  </p>
                </Show>
              </div>
            </div>

            <div class="detail-panel-body flex-1 overflow-auto px-6 py-5">
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(14rem,0.6fr)]">
                <div class="min-w-0 space-y-5">
                  <Show when={pickItemDescription(data(), language.locale())}>
                    <p class="text-[13px] leading-6 text-text-weak">{pickItemDescription(data(), language.locale())}</p>
                  </Show>

                  <Show when={hasHealthSignals(data().health) || hasEvaluation(data().evaluation)}>
                    <div class="space-y-4">
                      <div class="flex flex-wrap gap-4">
                        <Show
                          when={
                            data().evaluation && computeContentQuality(data().evaluation!) != null && data().evaluation
                          }
                        >
                          {(evaluation) => (
                            <div class="flex-1 min-w-[260px] rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 p-4">
                              <div class="mb-3 flex items-center justify-between gap-4">
                                <div
                                  class="text-xs"
                                  style={{
                                    color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                                    "font-weight": 700,
                                  }}
                                >
                                  {language.t("store.detail.eval.contentQuality")}
                                </div>
                                <span class="text-lg font-bold" style={{ color: meta().accent }}>
                                  {computeContentQuality(evaluation())}
                                </span>
                              </div>
                              <div class="space-y-2.5">
                                <For each={EVAL_DIMS}>
                                  {(dim) => {
                                    const val = evaluation()[dim]
                                    return (
                                      <Show when={val != null}>
                                        <div class="flex items-center gap-3">
                                          <span class="w-28 shrink-0 text-[11px] text-text-weak">
                                            {language.t("store.detail.eval." + dim)}
                                          </span>
                                          <div class="flex flex-1 gap-1">
                                            <For each={[1, 2, 3, 4, 5]}>
                                              {(seg) => (
                                                <div
                                                  class="h-2 flex-1 rounded-full"
                                                  style={{
                                                    "background-color":
                                                      seg <= (val as number)
                                                        ? meta().accent
                                                        : "color-mix(in srgb, var(--native-muted) 22%, var(--native-panel))",
                                                  }}
                                                />
                                              )}
                                            </For>
                                          </div>
                                          <span class="w-4 text-right text-[11px] text-text-weak">{val as number}</span>
                                        </div>
                                      </Show>
                                    )
                                  }}
                                </For>
                              </div>
                              <Show when={evaluation().evaluated_at}>
                                <p class="mt-3 text-[11px] text-text-weak">
                                  {language.t("store.detail.eval.evaluator")}:{" "}
                                  {evaluation().model_id === "__cached__"
                                    ? "deepseek-chat"
                                    : evaluation().model_id || "unknown"}{" "}
                                  · {formatDate(evaluation().evaluated_at!, language.locale())}
                                </p>
                              </Show>
                            </div>
                          )}
                        </Show>

                        <Show when={hasHealthSignals(data().health)}>
                          <div class="flex-1 min-w-[260px] rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 p-4">
                            <div class="mb-3 flex items-center justify-between gap-4">
                              <div
                                class="text-xs"
                                style={{
                                  color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                                  "font-weight": 700,
                                }}
                              >
                                {language.t("store.detail.health.title")}
                              </div>
                              <Show when={data().health?.score != null}>
                                <span class="text-lg font-bold" style={{ color: meta().accent }}>
                                  {Math.round(data().health!.score!)}
                                </span>
                              </Show>
                            </div>
                            <HealthRadar signals={data().health!.signals} accent={meta().accent} />
                          </div>
                        </Show>
                      </div>

                      <Show when={hasEvaluation(data().evaluation) && data().evaluation}>
                        {(evaluation) => (
                          <Show when={evaluation().final_score > 0}>
                            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 px-4 py-3">
                              <span
                                class="text-xs"
                                style={{
                                  color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                                  "font-weight": 700,
                                }}
                              >
                                {language.t("store.detail.overall.title")}
                              </span>
                              <span class="text-lg font-bold" style={{ color: meta().accent }}>
                                {Math.round(evaluation().final_score)}
                              </span>
                              <Show when={data().health?.score != null}>
                                <span class="text-[11px] text-text-weak">
                                  {language.t("store.detail.overall.breakdown")}
                                </span>
                              </Show>
                            </div>
                          </Show>
                        )}
                      </Show>
                    </div>
                  </Show>

                  <Show when={data().content}>
                    <div>
                      <Show
                        when={highlighted()}
                        fallback={
                          <div class="thin-scrollbar max-h-[50vh] min-h-[12rem] overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 p-4 text-14-regular leading-6">
                            <Markdown text={data().content} class="vscode-markdown" />
                          </div>
                        }
                      >
                        <div
                          class="thin-scrollbar max-h-[50vh] min-h-[12rem] overflow-x-auto overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 p-4 text-14-regular leading-6"
                          innerHTML={highlighted()}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>

                <aside class="min-w-0 space-y-5 xl:sticky xl:top-0 xl:self-start">
                  <div class="p-1">
                    <div class="space-y-3">
                      <div>
                        <div class="flex items-center gap-4 text-sm leading-5 text-text-strong">
                          <span
                            class="inline-flex items-center gap-1.5"
                            title={language.t("store.capability.type." + (data().itemType ?? "skill"))}
                          >
                            <div
                              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.375rem]"
                              style={{ "background-color": meta().bg, color: meta().accent }}
                            >
                              <Icon name={meta().icon} size="small" />
                            </div>
                            <span>{language.t("store.capability.type." + (data().itemType ?? "skill"))}</span>
                          </span>
                          <span
                            class="inline-flex items-center gap-1.5"
                            title={`${language.t("store.detail.previewCount")}: ${(props.previewCount ?? data().previewCount ?? 0).toLocaleString()}`}
                          >
                            <LocalIcon name="view" size="small" />
                            <span>{formatCompactCount(props.previewCount ?? data().previewCount ?? 0)}</span>
                          </span>
                          <span
                            class="inline-flex items-center gap-1.5"
                            title={`${language.t("store.detail.installCount")}: ${(props.installCount ?? data().installCount ?? 0).toLocaleString()}`}
                          >
                            <LocalIcon name="download" size="small" />
                            <span>{formatCompactCount(props.installCount ?? data().installCount ?? 0)}</span>
                          </span>
                          <span
                            class="inline-flex items-center gap-1.5"
                            title={`${language.t("store.detail.favoriteCount")}: ${(props.favoriteCount ?? data().favoriteCount ?? 0).toLocaleString()}`}
                          >
                            <LocalIcon name="subscribe" size="small" />
                            <span>{formatCompactCount(props.favoriteCount ?? data().favoriteCount ?? 0)}</span>
                          </span>
                        </div>
                      </div>

                      <Show when={data().source}>
                        {(() => {
                          const sourceLabel = itemFilterOptions.sourceLabel(data().source) || data().source
                          const sourceUrl = itemFilterOptions.sourceUrl(data().source)
                          const verified = !!sourceUrl

                          return (
                            <div>
                              <Show
                                when={verified}
                                fallback={
                                  <span
                                    class="inline-flex w-full cursor-default items-center justify-center gap-1.5 rounded-[0.5rem] border border-border-weak-base px-3 py-2 text-[14px] font-bold leading-5 text-text-weak"
                                    title={`${language.t("store.home.table.source")}: ${sourceLabel}`}
                                  >
                                    {sourceLabel}
                                  </span>
                                }
                              >
                                <a
                                  href={sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[0.5rem] border border-[rgba(245,138,25,0.9)] px-3 py-2 text-[14px] font-bold leading-5 text-[#f58b19] transition-colors hover:bg-[color-mix(in_srgb,rgb(245,138,25)_10%,var(--native-bg-subtle))]"
                                  title={`${language.t("store.home.table.source")}: ${sourceLabel}`}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  >
                                    <path d="M7 17 17 7" />
                                    <path d="M9 7h8v8" />
                                  </svg>
                                  <span>{sourceLabel}</span>
                                </a>
                              </Show>
                            </div>
                          )
                        })()}
                      </Show>

                      {/* Local install box hidden — see PR #112 */}
                      {/* <Show when={data().itemType === "plugin"}>
                        <div class="space-y-2 rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 p-3">
                          ...
                        </div>
                      </Show> */}

                      <div>
                        <div class="flex items-center justify-between gap-4">
                          <div
                            class="text-xs"
                            style={{
                              color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                              "font-weight": 700,
                            }}
                          >
                            {language.t("store.console.capabilities.visibility")}
                          </div>
                          <div class="inline-flex items-center gap-1.5 text-right text-sm leading-5 text-text-strong">
                            <VisibilityIcon visibility={data().repoVisibility} />
                            <span>
                              {data().repoVisibility === "public"
                                ? language.t("store.capability.visibility.public")
                                : data().repoVisibility === "private"
                                  ? language.t("store.capability.visibility.private")
                                  : "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Show when={data().forkedFromItemId}>
                        <div>
                          <button
                            type="button"
                            onClick={() => navigate(`/capabilities/${data().forkedFromItemId}/edit`)}
                            class="inline-flex max-w-full cursor-pointer items-center gap-1.5 text-sm leading-5 text-text-weak transition-colors hover:text-[var(--native-primary)]"
                            title={language.t("store.detail.forkedFrom", {
                              name: forkedFromName() ?? data().forkedFromOwnerId ?? "",
                            })}
                          >
                            <LocalIcon name="fork" size="small" style={{ width: "14px", height: "14px" }} />
                            <span class="truncate">
                              {language.t("store.detail.forkedFrom", {
                                name: forkedFromName() ?? data().forkedFromOwnerId ?? "",
                              })}
                            </span>
                          </button>
                        </div>
                      </Show>

                      <Show when={authorInfo() || authorName()}>
                        <div>
                          <div class="flex items-center justify-between gap-4">
                            <div
                              class="text-xs"
                              style={{
                                color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                                "font-weight": 700,
                              }}
                            >
                              {language.t("store.detail.author")}
                            </div>
                            <div class="flex min-w-0 flex-col items-end">
                              <span class="max-w-[12rem] truncate text-right text-sm leading-5 text-text-strong">
                                {authorInfo()?.name ?? authorName() ?? data().createdBy}
                              </span>
                              <Show when={data().createdBy}>
                                <button
                                  type="button"
                                  class="inline-flex cursor-pointer items-center gap-1 text-right font-mono text-[11px] leading-4 text-text-weak transition-colors duration-150 hover:text-text-strong"
                                  title={data().createdBy}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void copyAuthorId(data().createdBy)
                                  }}
                                >
                                  <span>{shortId(data().createdBy)}</span>
                                  <Icon name={idCopied() ? "check" : "link"} size="small" />
                                </button>
                              </Show>
                            </div>
                          </div>
                        </div>
                      </Show>

                      <Show when={data().category}>
                        <div>
                          <div class="flex items-center justify-between gap-4">
                            <div
                              class="text-xs"
                              style={{
                                color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                                "font-weight": 700,
                              }}
                            >
                              {language.t("store.console.capabilities.category")}
                            </div>
                            <div class="text-right text-sm leading-5 text-text-strong">
                              {itemFilterOptions.categoryLabel(data().category) || data().category}
                            </div>
                          </div>
                        </div>
                      </Show>

                      <div>
                        <div
                          class="mb-1 text-xs"
                          style={{
                            color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                            "font-weight": 700,
                          }}
                        >
                          {language.t("store.security.riskLevel")}
                        </div>
                        <div>
                          <SecurityTag status={data().securityStatus} />
                        </div>
                      </div>

                      <Show when={(data().tags ?? []).length > 0}>
                        <div>
                          <div
                            class="mb-2 text-xs"
                            style={{
                              color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                              "font-weight": 700,
                            }}
                          >
                            {language.t("store.home.table.tag")}
                          </div>
                          <div class="flex flex-wrap items-center gap-1.5">
                            <For each={[...(data().tags ?? [])].sort(compareTags)}>
                              {(tag) => (
                                <span
                                  class="inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] leading-4 font-semibold"
                                  style={tagStyle(tag.tagClass)}
                                  title={tag.slug}
                                >
                                  <span class="truncate">{tag.slug}</span>
                                </span>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>

                      <div class="space-y-3">
                        <div class="flex items-center justify-between gap-4">
                          <div
                            class="text-xs"
                            style={{
                              color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                              "font-weight": 700,
                            }}
                          >
                            {language.t("store.detail.created")}
                          </div>
                          <div class="text-right text-sm leading-5 text-text-strong">
                            {formatDate(data().createdAt, language.locale())}
                          </div>
                        </div>
                        <div class="flex items-center justify-between gap-4">
                          <div
                            class="text-xs"
                            style={{
                              color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                              "font-weight": 700,
                            }}
                          >
                            {language.t("store.detail.updated")}
                          </div>
                          <div class="text-right text-sm leading-5 text-text-strong">
                            {formatDate(data().updatedAt, language.locale())}
                          </div>
                        </div>
                      </div>

                      {/* MCP parameter config — inline, LAST block in the sidebar. Only for MCP
                          items that have detected placeholder fields. Re-editable any time. */}
                      <Show when={mcpHasFields()}>
                        <div class="space-y-2 rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 p-3">
                          <div
                            class="text-xs"
                            style={{
                              color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                              "font-weight": 700,
                            }}
                          >
                            {language.t("store.detail.mcpConfig.title")}
                          </div>
                          <Show
                            when={props.isAuthenticated}
                            fallback={
                              <p class="text-12-regular text-text-weak">
                                {language.t("store.detail.mcpConfig.signInTooltip")}
                              </p>
                            }
                          >
                            <McpConfigForm
                              itemId={data().id}
                              metadata={data().metadata as Record<string, unknown> | undefined}
                              status={mcpStatus() ?? undefined}
                              onSaved={onMcpSaved}
                            />
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        )}
      </Show>
    </Show>
  )
}
