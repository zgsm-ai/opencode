import { createResource, createSignal, createEffect, createMemo, Show, For } from "solid-js"
import { createHighlighter } from "shiki"
import QRCode from "qrcode"
import { useTheme } from "@opencode-ai/ui/theme"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/ui/markdown"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ConfirmDialog } from "./confirm-dialog"
import { LocalIcon } from "@/components/local-icon"
import AvatarDisplay from "@/components/avatar-display"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useAuth } from "@/context/auth"
import { useNavigate } from "@solidjs/router"
import { env } from "@/lib/env"
import { itemApi, scanApi, userApi, type CapabilityItem, type ScanResult } from "../lib/api"
import { useLanguage } from "@/context/language"
import { pickItemDescription } from "../lib/item-description"
import SecurityTag, { VerdictTag, type Verdict } from "./security-tag"
import HealthRadar from "./health-radar"
import { SubscribeButton } from "./subscribe-button"
import { UsageSection } from "./usage-section"
import { matchEnterprise, matchEnterpriseByName, type EnterpriseInfo } from "../lib/enterprise"
import { useLogoColor } from "../lib/use-logo-color"
import { StoreIcon } from "../lib/store-icons"
import { DistributeDialog } from "./distribute-dialog"
import { BuiltinContentDialog } from "./builtin-content-dialog"
import { McpConfigForm } from "./mcp-config-form"
import { SubItemTree } from "./sub-item-tree"
import { detectMcpFields, mcpRequiresPluginRuntime } from "../lib/mcp-config"
import type { McpConfigStatus } from "../lib/api"
import "@/styles/vscode-markdown.css"

// Shared item-type presentation (tile color + icon + i18n label key). Consumed by the
// detail header, the bundled "work tree" (sub-item-tree.tsx). Keys MUST stay in sync with
// the item_type values the backend emits: skill/subagent/command/mcp/rule/template/plugin
// (catalog/web/frontend type lists — see design.md §0). `icon` names are from
// @opencode-ai/ui/icon; widen this union when adding a type.
export type TypeMeta = {
  accent: string
  bg: string
  label: string
  icon: "sparkles" | "brain" | "console" | "mcp" | "configuration" | "shield" | "file-text"
}

export const TYPE_META: Record<string, TypeMeta> = {
  skill: { accent: "#ffa000", bg: "color-mix(in srgb, #ffa000 12%, var(--native-panel))", label: "store.sidebar.nav.skills", icon: "sparkles" },
  subagent: { accent: "#1670ff", bg: "color-mix(in srgb, #1670ff 12%, var(--native-panel))", label: "store.sidebar.nav.subagents", icon: "brain" },
  command: { accent: "#09b179", bg: "color-mix(in srgb, #09b179 12%, var(--native-panel))", label: "store.sidebar.nav.commands", icon: "console" },
  mcp: { accent: "#7338f9", bg: "color-mix(in srgb, #7338f9 12%, var(--native-panel))", label: "store.sidebar.nav.mcpServers", icon: "mcp" },
  rule: { accent: "#dc2626", bg: "color-mix(in srgb, #dc2626 12%, var(--native-panel))", label: "store.sidebar.nav.rules", icon: "shield" },
  template: { accent: "#0891b2", bg: "color-mix(in srgb, #0891b2 12%, var(--native-panel))", label: "store.sidebar.nav.templates", icon: "file-text" },
  plugin: { accent: "#EC4899", bg: "color-mix(in srgb, #EC4899 12%, var(--native-panel))", label: "store.sidebar.nav.plugins", icon: "configuration" },
}

// Gold accent (设计稿 --gold) for the enterprise gold edge / brand seal — matches store-card-grid.
const ENTERPRISE_GOLD = "#E5B645"

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
//
// FALLBACK ONLY. The upstream catalog bundle now provides an authoritative
// per-type `evaluation.content_quality` (correct weights for plugin/rule/prompt),
// passed through verbatim by the backend. Prefer that value; this client-side
// recompute only runs for entries that predate it and is APPROXIMATE for
// non-skill types (it always applies the 6-dim skill weights above).
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

// Returns the install command, plugin items only:
//  1) legacy zip_download (backend-injected for plugins lacking marketplace
//     install metadata) -> the joined shell commands;
//  2) marketplace plugins -> `csc plugin install <plugin_name>@costrict-plugins`.
//     plugin_name comes from metadata.install.plugin_name (NOT item.slug, which
//     carries an owner prefix); the `costrict-plugins` marketplace is the unified
//     publish target every first-party plugin ships to (see server
//     parser_service.go synthesizePluginContent), so it is intentionally fixed
//     and must NOT use the upstream marketplace_name/marketplace_repo.
// Non-plugin types (skill/subagent/command/mcp) are distributed via upstream
// subscription and have no install command -> null (UI hides the block).
export function getInstallCommand(item: CapabilityItem): string | null {
  const install = (item.metadata as Record<string, any> | undefined)?.install
  if (install?.method === "zip_download" && Array.isArray(install.commands)) {
    return install.commands.join("\n")
  }
  if (item.itemType === "plugin" && typeof install?.plugin_name === "string" && install.plugin_name) {
    return `csc plugin install ${install.plugin_name}@costrict-plugins`
  }
  return null
}

function formatDate(iso: string, locale?: string) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const normalizedLocale = locale?.startsWith("zh") ? "zh-CN" : "en-US"
  return new Intl.DateTimeFormat(normalizedLocale, {
    year: "numeric",
    month: normalizedLocale === "zh-CN" ? "long" : "short",
    day: "numeric",
  }).format(d)
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

// Extracts a human-readable reason from a scan finding object (redFlags/recommendations),
// preferring known text fields with an optional severity/type label prefix.
function formatValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    const pick = (keys: string[]): string | undefined => {
      for (const key of keys) {
        const candidate = record[key]
        if (typeof candidate === "string" && candidate.length > 0) return candidate
      }
      return undefined
    }
    const text = pick(["message", "reason", "description", "detail", "text", "title", "name"])
    if (text) {
      const label = pick(["severity", "type", "level", "category"])
      return label ? `[${label}] ${text}` : text
    }
  }
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

function ScanRow(props: { scan: ScanResult }) {
  const [open, setOpen] = createSignal(false)
  const language = useLanguage()

  const permLabel = (key: string) => {
    if (key === "files") return language.t("store.scanResults.permFiles")
    if (key === "network") return language.t("store.scanResults.permNetwork")
    if (key === "commands") return language.t("store.scanResults.permCommands")
    return key
  }

  const formatPermValue = (val: unknown): string => {
    if (Array.isArray(val)) return val.length ? val.map(String).join(", ") : "—"
    const formatted = formatValue(val)
    return formatted === "" ? "—" : formatted
  }

  const redFlags = () => props.scan.redFlags ?? []
  const recommendations = () => props.scan.recommendations ?? []
  const perms = () => Object.entries(props.scan.permissions ?? {})
  const meta = () =>
    [
      props.scan.scanModel,
      props.scan.triggerType,
      formatDuration(props.scan.durationMs),
      formatDate(props.scan.finishedAt, language.locale()),
    ]
      .filter(Boolean)
      .join(" · ")

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open()}
        aria-label={language.t("store.scanResults.details")}
        class="group -mx-1.5 flex w-full flex-col gap-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--native-muted)_8%,transparent)]"
      >
        <div class="flex items-center justify-between gap-4">
          <div
            class="text-xs"
            style={{
              color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
              "font-weight": 700,
            }}
          >
            {language.t("store.security.riskLevel")}
          </div>
          <div class="flex items-center gap-1.5">
            <SecurityTag status={props.scan.riskLevel as never} />
            <VerdictTag verdict={props.scan.verdict as Verdict} />
            <Icon
              name="chevron-down"
              size="small"
              class={`shrink-0 text-text-weak transition-transform duration-150 ${open() ? "rotate-180" : ""}`}
            />
          </div>
        </div>

        <Show when={props.scan.summary}>
          <p class="break-words text-12-regular leading-5 text-text-weak">{props.scan.summary}</p>
        </Show>
      </button>

      <Show when={open()}>
        <div class="mt-2 space-y-3 text-12-regular">
          <div>
            <div class="mb-1 text-xs text-text-weak/70">{language.t("store.security.foundIssues")}</div>
            <Show
              when={redFlags().length > 0}
              fallback={<div class="text-text-weak">{language.t("store.scanResults.noRedFlags")}</div>}
            >
              <ul class="list-disc space-y-1 pl-4">
                <For each={redFlags()}>{(f) => <li class="break-words text-text-strong">{formatValue(f)}</li>}</For>
              </ul>
            </Show>
          </div>

          <div>
            <div class="mb-1 text-xs text-text-weak/70">{language.t("store.security.suggestions")}</div>
            <Show
              when={recommendations().length > 0}
              fallback={<div class="text-text-weak">{language.t("store.scanResults.noRecommendations")}</div>}
            >
              <ul class="list-disc space-y-1 pl-4">
                <For each={recommendations()}>{(r) => <li class="break-words text-text-strong">{formatValue(r)}</li>}</For>
              </ul>
            </Show>
          </div>

          <Show when={perms().length > 0}>
            <div>
              <div class="mb-1 text-xs text-text-weak/70">{language.t("store.security.permissionNeeds")}</div>
              <div class="space-y-1">
                <For each={perms()}>
                  {(entry) => (
                    <div class="flex items-center justify-between gap-4">
                      <span class="text-text-weak/70">{permLabel(entry[0])}</span>
                      <span class="break-words text-right text-text-strong">{formatPermValue(entry[1])}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={meta()}>
            <div class="text-text-weak/70">{meta()}</div>
          </Show>
        </div>
      </Show>
    </div>
  )
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
  onDeleted?: () => void
  onSelectItem?: (itemId: string) => void
  favorited?: boolean
  favoriteCount?: number
  previewCount?: number
  installCount?: number
  /** invokeMode is forwarded to the favorite API for skill-family subscribe/switch. */
  onToggleFavorite?: (invokeMode?: "auto" | "manual") => Promise<void>
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
  const [scans] = createResource(
    () => props.itemId,
    (id) => scanApi.list(id).then((r) => r.results),
  )

  createEffect(() => {
    const data = item()
    if (data) props.onItemLoaded?.(data)
  })

  // ─── 订阅调用模式（allow AI auto-invoke vs manual /name only）──────────────────────────
  // 仅 skill / command 走 skill discovery、disable-model-invocation 才真实生效。subagent 经
  // Task 工具调用、不受此键影响，故不提供模式开关（其用法在「使用方法」区块单独说明）。
  const INVOKE_MODE_TYPES = new Set(["skill", "command"])
  const invokeModeEnabled = () => INVOKE_MODE_TYPES.has(item()?.itemType ?? "")
  // 本地维护当前模式（乐观更新）：已订阅时显示其模式，未订阅为 null。
  const [invokeMode, setInvokeMode] = createSignal<"auto" | "manual" | null>(null)
  // item 载入时按云端回显 seed；取消订阅（favorited 变 false）时清空。
  createEffect(() => {
    const data = item()
    if (data && props.favorited) setInvokeMode(data.invokeMode ?? "auto")
  })
  createEffect(() => {
    if (!props.favorited) setInvokeMode(null)
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
  // 系统/官方内置账号（forkedFromOwnerId === "system"）显示友好文案，避免露出技术值「Fork 自 system」。
  const forkedFromText = () =>
    item()?.forkedFromOwnerId === "system"
      ? language.t("store.detail.forkedFromOfficial")
      : language.t("store.detail.forkedFrom", {
          name: forkedFromName() ?? item()?.forkedFromOwnerId ?? "",
        })
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

  const [subSkills] = createResource(
    () => (item()?.itemType === "plugin" ? item()!.id : null),
    (pluginId) => itemApi.list({ parentPluginId: pluginId, pageSize: 100 }).then((res) => res.items),
  )

  const meta = () => TYPE_META[item()?.itemType ?? "skill"] ?? TYPE_META.skill
  const canEditItem = () => !!item() && !!auth.user() && item()!.createdBy === auth.user()!.id

  // 大客户品牌化：与列表卡片一致的判定（createdBy 命中真实配置，回退 name 命中 demo）。命中时用
  // logo 抽出的品牌色注入 --bc，详情 header 套上白底 logo tile + 品牌印章 + 品牌色渐变背景 + 水印。
  const enterprise = createMemo<EnterpriseInfo | null>(() => {
    const data = item()
    if (!data) return null
    return matchEnterprise(data.createdBy) ?? matchEnterpriseByName(data.name)
  })
  const brandColor = useLogoColor(() => enterprise()?.logo)

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
  // A plugin-runtime-dependent MCP (references ${CLAUDE_PLUGIN_ROOT} etc.) cannot run
  // standalone — block subscribing it directly and point the user at the parent plugin.
  // Unsubscribing an already-favorited item stays allowed.
  const mcpPluginRuntimeBlocks = () =>
    item()?.itemType === "mcp" &&
    !props.favorited &&
    mcpRequiresPluginRuntime(item()?.metadata as Record<string, unknown> | undefined)

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
    const cmd = item() ? getInstallCommand(item()!) : null
    if (!cmd) return
    await navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyAuthorId = async (id: string) => {
    await navigator.clipboard.writeText(id)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 1500)
  }

  const openParentPlugin = () => {
    const data = item()
    const parentID = data?.parentPluginId
    if (!parentID) return
    if (props.onSelectItem) {
      props.onSelectItem(parentID)
      return
    }
    navigate(`/store/${parentID}`)
  }

  const openIncludedItem = (itemId: string) => {
    if (props.onSelectItem) {
      props.onSelectItem(itemId)
      return
    }
    navigate(`/store/${itemId}`)
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
        when={!item.error}
        fallback={
          <div class="flex flex-col items-center justify-center gap-4 py-16">
            <p class="text-destructive">{language.t("store.detail.loadFailed")}</p>
            <button
              onClick={() => void refetchItem()}
              class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
            >
              <Icon name="reset" size="small" />
              <span>{language.t("store.detail.retry")}</span>
            </button>
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
            <div
              class="detail-panel-header relative overflow-hidden border-b border-border-weak-base px-6 pb-5 pr-14 pt-6"
              classList={{ "border-b-[color:color-mix(in_oklab,var(--detail-brand)_30%,var(--native-border))]": !!enterprise() }}
              style={enterprise() ? { "--detail-brand": brandColor() } : undefined}
            >
              {/* 大客户：品牌色淡渐变 header 背景 + logo 水印 + 顶部金线，和列表卡片同一套设计语言。 */}
              <Show when={enterprise()}>
                {(info) => (
                  <>
                    <div
                      aria-hidden="true"
                      class="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(135deg, color-mix(in oklab, var(--detail-brand) 12%, transparent), transparent 46%)",
                      }}
                    />
                    <div
                      aria-hidden="true"
                      class="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                      style={{
                        background: `linear-gradient(90deg, color-mix(in oklab, ${ENTERPRISE_GOLD} 70%, transparent), transparent 40%, color-mix(in oklab, var(--detail-brand) 55%, transparent))`,
                      }}
                    />
                    <img
                      src={info().logo}
                      alt=""
                      aria-hidden="true"
                      class="pointer-events-none absolute right-[-30px] top-1/2 size-[168px] -translate-y-1/2 rounded-[18px] object-contain opacity-[0.06]"
                    />
                  </>
                )}
              </Show>
              <div class="relative">
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
                    {/* 大客户：白底圆角 logo tile（与列表卡片一致）；否则 type 图标 tile。 */}
                    <Show
                      when={enterprise()}
                      fallback={
                        <div
                          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)]"
                          style={{ "background-color": meta().bg, color: meta().accent }}
                        >
                          <Icon name={meta().icon} />
                        </div>
                      }
                    >
                      {(info) => (
                        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)] border border-[color:color-mix(in_srgb,var(--native-border)_60%,transparent)] bg-[#fff] p-[5px] shadow-[var(--native-shadow-sm)]">
                          <img src={info().logo} alt={info().name} class="size-full object-contain" />
                        </div>
                      )}
                    </Show>
                    <div class="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h1
                        class="min-w-0 text-text-strong"
                        style={{ "font-size": "24px", "letter-spacing": "-0.02em", "line-height": "1.25" }}
                      >
                        {data().name}
                      </h1>
                      {/* 大客户企业名印章：品牌色文字 + 边 + circle-check（与列表 seal 同语言）。 */}
                      <Show when={enterprise()}>
                        {(info) => (
                          <span
                            class="inline-flex shrink-0 items-center gap-1 rounded-[var(--native-radius-full)] border px-2.5 py-[2px] text-[11.5px] font-bold"
                            style={{
                              "--detail-brand": brandColor(),
                              "border-color": "color-mix(in oklab, var(--detail-brand) 35%, transparent)",
                              "background-color": "color-mix(in oklab, var(--detail-brand) 10%, var(--native-panel))",
                              color: "var(--detail-brand)",
                            }}
                            title={language.t("store.detail.enterprise.label")}
                          >
                            {info().name}
                            <StoreIcon name="checkCircle" size={12} style={{ color: "var(--detail-brand)" }} />
                          </span>
                        )}
                      </Show>
                    </div>
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
                    <Show when={canEditItem() && props.onDeleted}>
                      <button
                        onClick={() => {
                          const id = data().id
                          dialog.show(() => (
                            <ConfirmDialog
                              title={language.t("store.console.capabilities.delete")}
                              description={language.t("store.console.confirmDeleteCapability")}
                              confirm={language.t("common.delete")}
                              onConfirm={async () => {
                                try {
                                  await itemApi.delete(id)
                                  showToast({ title: language.t("store.console.capabilities.toast.deleteSuccess") })
                                  props.onDeleted?.()
                                } catch (error) {
                                  showToast({
                                    title: language.t("store.console.capabilities.toast.deleteFailed"),
                                    description: error instanceof Error ? error.message : String(error),
                                  })
                                  throw error
                                }
                              }}
                            />
                          ))
                        }}
                        class="inline-flex items-center gap-1.5 rounded-lg border border-border-weak-base px-3 py-1.5 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-destructive"
                        title={language.t("common.delete")}
                      >
                        <Icon name="trash" size="small" />
                        <span>{language.t("common.delete")}</span>
                      </button>
                    </Show>
                    {/* 订阅按钮：复用列表/卡片同款 SubscribeButton（铃铛 ring + ping + 自然宽度 FLIP），
                        与全站设计语言对齐。详情页 onToggleFavorite 无参，包一层喂给 (item)=>void 签名；
                        MCP 未配置 / 依赖插件运行时仍沿用详情页已算好的 gate 作为 disabled。 */}
                    <Show when={props.onToggleFavorite}>
                      <SubscribeButton
                        item={data()}
                        favorited={!!props.favorited}
                        favoriteCount={props.favoriteCount ?? data().favoriteCount ?? 0}
                        pending={props.favoritePending}
                        authenticated={!!props.isAuthenticated}
                        disabled={mcpPluginRuntimeBlocks() || mcpGateBlocks()}
                        invokeModeEnabled={invokeModeEnabled()}
                        currentMode={invokeMode()}
                        onToggle={(_item, mode) => {
                          if (mode) {
                            setInvokeMode(mode)
                            // Patch the resource so the cloud-echo re-seed (when favorited flips
                            // false→true) reads the chosen mode instead of the stale undefined.
                            mutateItem((p) => (p ? { ...p, invokeMode: mode, favorited: true } : p))
                          }
                          void props.onToggleFavorite?.(mode)
                        }}
                        labels={{
                          subscribe: language.t("store.detail.favorite"),
                          subscribed: language.t("store.detail.unfavorite"),
                          tooltip: language.t("store.detail.subscribeTooltip"),
                        }}
                        modeLabels={{
                          menuTooltip: language.t("store.detail.invokeMode.menuTooltip"),
                          subscribeAuto: language.t("store.detail.invokeMode.subscribeAuto"),
                          subscribeAutoDesc: language.t("store.detail.invokeMode.subscribeAutoDesc"),
                          subscribeManual: language.t("store.detail.invokeMode.subscribeManual"),
                          subscribeManualDesc: language.t("store.detail.invokeMode.subscribeManualDesc"),
                          currentAuto: language.t("store.detail.invokeMode.currentAuto"),
                          currentManual: language.t("store.detail.invokeMode.currentManual"),
                          switchToAuto: language.t("store.detail.invokeMode.switchToAuto"),
                          switchToManual: language.t("store.detail.invokeMode.switchToManual"),
                        }}
                      />
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
                          title={
                            data().isBuiltIn
                              ? language.t("store.detail.cancelBuiltInPlugin")
                              : language.t("store.detail.setBuiltInPlugin")
                          }
                        >
                          <LocalIcon name={data().isBuiltIn ? "star-filled" : "star"} size="small" />
                          <span>
                            {data().isBuiltIn
                              ? language.t("store.detail.cancelBuiltIn")
                              : language.t("store.detail.setBuiltIn")}
                          </span>
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
                <Show when={props.onToggleFavorite && props.isAuthenticated && mcpPluginRuntimeBlocks()}>
                  <p class="text-right text-12-regular text-text-weak">
                    {language.t("store.detail.mcpConfig.pluginRuntimeReason")}
                  </p>
                </Show>
                <Show when={props.onToggleFavorite && props.isAuthenticated && !mcpPluginRuntimeBlocks() && mcpGateBlocks()}>
                  <p class="text-right text-12-regular text-text-weak">
                    {language.t("store.detail.mcpConfig.gateHint")}
                  </p>
                </Show>
              </div>
              </div>
            </div>

            <div class="detail-panel-body flex-1 overflow-auto px-6 py-5">
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(14rem,0.6fr)]">
                <div class="min-w-0 space-y-5">
                  <Show when={pickItemDescription(data(), language.locale())}>
                    <p class="text-[13px] leading-6 text-text-weak">{pickItemDescription(data(), language.locale())}</p>
                  </Show>

                  <UsageSection
                    itemType={data().itemType}
                    name={data().slug ?? data().name}
                    invokeMode={invokeMode()}
                    favorited={!!props.favorited}
                  />

                  <Show when={data().parentPluginName && data().parentPluginId}>
                    <div class="flex flex-wrap items-center gap-1.5 rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 px-3 py-2 text-[13px] leading-5 text-text-weak">
                      <Icon name="configuration" size="small" />
                      <span>{language.t("store.item.fromPluginLabel")}</span>
                      <button
                        type="button"
                        class="font-semibold text-text-strong underline-offset-2 transition-colors hover:text-[var(--native-primary)] hover:underline"
                        onClick={openParentPlugin}
                        title={data().parentPluginName}
                      >
                        {data().parentPluginName}
                      </button>
                    </div>
                  </Show>

                  {/* Usage：安装命令一键复制。仅当 item 有真实安装方式（getInstallCommand 非 null，
                      当前只有 plugin 的 metadata.install zip_download）才渲染整块；skill 等靠上游订阅
                      分发、无安装命令的类型不显示。复制按钮在命令框右侧（图标 link→check 2s）。 */}
                  <Show when={getInstallCommand(data())}>
                    {(installCmd) => (
                      <div>
                        <div
                          class="mb-2 text-xs"
                          style={{
                            color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                            "font-weight": 700,
                          }}
                        >
                          {language.t("store.detail.usage.title")}
                        </div>
                        <div class="flex items-stretch gap-2">
                          <code class="thin-scrollbar min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/50 px-3 py-2.5 text-12-mono leading-5 text-text-strong">
                            {installCmd()}
                          </code>
                          <button
                            type="button"
                            onClick={() => void copy()}
                            class="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--native-radius-md)] border border-border-weak-base px-3 text-12-regular text-text-weak transition-colors duration-150 hover:bg-bg-muted hover:text-text-strong"
                            classList={{ "!text-[var(--native-success)]": copied() }}
                            title={copied() ? language.t("store.detail.usage.copied") : language.t("store.detail.usage.copy")}
                            aria-label={language.t("store.detail.usage.copy")}
                          >
                            <Icon name={copied() ? "check" : "copy"} size="small" />
                            <span class="max-sm:hidden">
                              {copied() ? language.t("store.detail.usage.copied") : language.t("store.detail.usage.copy")}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </Show>

                  <Show when={hasHealthSignals(data().health) || hasEvaluation(data().evaluation)}>
                    <div class="space-y-4">
                      <div class="flex flex-wrap gap-4">
                        <Show
                          when={
                            data().evaluation &&
                            (data().evaluation!.content_quality ?? computeContentQuality(data().evaluation!)) != null &&
                            data().evaluation
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
                                <span class="inline-flex items-baseline gap-0.5 font-bold" style={{ color: meta().accent }}>
                                  <span class="text-lg">{evaluation().content_quality ?? computeContentQuality(evaluation())}</span>
                                  <span class="text-[11px] font-semibold opacity-60">/100</span>
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
                              <Show when={(data().health?.effective_score ?? data().health?.score) != null}>
                                <span
                                  class="inline-flex items-baseline gap-0.5 font-bold"
                                  style={{ color: meta().accent }}
                                >
                                  <span class="text-lg">{Math.round((data().health!.effective_score ?? data().health!.score)!)}</span>
                                  <span class="text-[11px] font-semibold opacity-60">/100</span>
                                  <Show when={(data().health?.excluded_signals?.length ?? 0) > 0}>
                                    <span
                                      class="cursor-help text-[11px] leading-none text-text-weak"
                                      title={
                                        data().health?.excluded_signals?.includes("popularity")
                                          ? language.t("store.detail.health.popularityExcluded")
                                          : language.t("store.detail.health.signalsExcluded")
                                      }
                                    >
                                      *
                                    </span>
                                  </Show>
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
                              {/* Show the 85/15 blend formula whenever an overall
                                  score exists. The breakdown is a fixed caption
                                  (store.detail.overall.breakdown) describing the
                                  blend ratio, not the concrete per-term values, so
                                  it is safe to show alongside the score even when
                                  the raw content_quality / effective_score fields
                                  are null (the displayed number falls back to
                                  computeContentQuality / health.score). This keeps
                                  the overall score detailed instead of a lone digit. */}
                              <span class="text-[11px] text-text-weak">
                                {language.t("store.detail.overall.breakdown")}
                              </span>
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
                          <div class="thin-scrollbar min-h-[28rem] overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 px-5 py-4">
                            <Markdown text={data().content} class="vscode-markdown text-14-regular" />
                          </div>
                        }
                      >
                        <div
                          class="thin-scrollbar min-h-[28rem] overflow-x-auto overflow-y-auto rounded-lg border border-border-weak-base bg-bg-muted/50 p-4 text-12-mono leading-6 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0"
                          innerHTML={highlighted()}
                        />
                      </Show>
                    </div>
                  </Show>

                  <Show when={data().itemType === "plugin"}>
                    <div>
                      <div
                        class="mb-3 text-xs"
                        style={{
                          color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                          "font-weight": 700,
                        }}
                      >
                        {language.t("store.detail.bundledSkills")}
                      </div>
                      <Show
                        when={(subSkills() ?? []).length > 0}
                        fallback={
                          <Show when={!subSkills.loading}>
                            <p class="text-[13px] text-text-weak">{language.t("store.detail.bundledSkills.empty")}</p>
                          </Show>
                        }
                      >
                        <div class="rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/20 py-1">
                          <SubItemTree items={subSkills() ?? []} onSelect={openIncludedItem} />
                        </div>
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
                            title={`${language.t("store.detail.favoriteCount")}: ${(props.favoriteCount ?? data().favoriteCount ?? 0).toLocaleString()}`}
                          >
                            <LocalIcon name="subscribe" size="small" />
                            <span>{formatCompactCount(props.favoriteCount ?? data().favoriteCount ?? 0)}</span>
                          </span>
                        </div>
                      </div>

                      {/* 仅当 source 可识别（命中已知来源映射表）才显示来源框；不可识别（空 / UUID / 未收录值）整体隐藏，
                          避免裸露脏值。已知但无 url 的来源（如 internal）仍显示纯 label（不可点）。 */}
                      <Show when={data().source && itemFilterOptions.isKnownSource(data().source)}>
                        {(() => {
                          const sourceLabel = itemFilterOptions.sourceLabel(data().source) || data().source
                          const sourceUrl = itemFilterOptions.sourceUrl(data().source)

                          return (
                            <div>
                              <Show
                                when={sourceUrl}
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
                            title={forkedFromText()}
                          >
                            <LocalIcon name="fork" size="small" style={{ width: "14px", height: "14px" }} />
                            <span class="truncate">{forkedFromText()}</span>
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
                            <div class="flex min-w-0 items-center gap-2">
                              <Show when={authorInfo()?.avatarUrl}>
                                <AvatarDisplay
                                  avatarUrl={authorInfo()?.avatarUrl}
                                  username={authorInfo()?.name ?? authorName() ?? data().createdBy}
                                  title={authorInfo()?.name ?? authorName() ?? data().createdBy}
                                  size="1.75rem"
                                  class="shrink-0"
                                />
                              </Show>
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

                      <Show
                        when={!scans.error && scans()?.[0]}
                        fallback={
                          <div class="flex items-center justify-between gap-4">
                            <div
                              class="text-xs"
                              style={{
                                color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
                                "font-weight": 700,
                              }}
                            >
                              {language.t("store.security.riskLevel")}
                            </div>
                            <div class="flex items-center gap-1.5">
                              <Show when={scans.loading}>
                                <span class="text-12-regular text-text-weak">{language.t("store.loading")}</span>
                              </Show>
                              <SecurityTag status={data().securityStatus} />
                            </div>
                          </div>
                        }
                      >
                        {(scan) => <ScanRow scan={scan()} />}
                      </Show>

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
    </Show>
  )
}
