import { Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"

/**
 * 「使用方法」区块：订阅后如何在 CoStrict (csc) / 其它 CS-IDE 中使用该资源。
 *
 * - skill 系（skill/command/subagent）：文案随订阅模式联动（auto = AI 自动调用；
 *   manual = 仅手动 /name；未订阅 = 中性说明），并展示可手动触发的斜杠命令 `/<slug>`。
 * - mcp / rule / template：各自的应用方式。
 * - plugin：沿用详情页既有的「安装命令」区块，这里不重复渲染。
 */
export function UsageSection(props: {
  itemType: string
  /** slug used to form the `/name` slash command. */
  name: string
  invokeMode: "auto" | "manual" | null
  favorited: boolean
}): JSX.Element {
  const language = useLanguage()
  // Mode-aware slash-command guidance only applies to skill / command (they honor
  // disable-model-invocation). subagent gets its own static note.
  const hasInvokeMode = () => ["skill", "command"].includes(props.itemType)
  const slashCmd = () => `/${props.name}`

  const lead = () => {
    if (hasInvokeMode()) {
      return props.invokeMode === "manual"
        ? language.t("store.detail.usage.skill.manual")
        : language.t("store.detail.usage.skill.auto")
    }
    if (props.itemType === "subagent") return language.t("store.detail.usage.subagent")
    if (props.itemType === "mcp") return language.t("store.detail.usage.mcp")
    if (props.itemType === "rule") return language.t("store.detail.usage.rule")
    if (props.itemType === "template") return language.t("store.detail.usage.template")
    return ""
  }

  // 「使用方法」只在订阅后展示（订阅前不可见）。
  return (
    <Show when={props.favorited && props.itemType !== "plugin" && lead()}>
      <div>
        <div
          class="mb-2 text-xs"
          style={{
            color: "color-mix(in srgb, var(--native-muted) 70%, var(--native-panel))",
            "font-weight": 700,
          }}
        >
          {language.t("store.detail.usage.sectionTitle")}
        </div>
        <div class="space-y-2 rounded-[var(--native-radius-md)] border border-border-weak-base bg-bg-muted/40 px-3 py-2.5 text-[13px] leading-6 text-text-weak">
          <p>{lead()}</p>
          <Show when={hasInvokeMode()}>
            <code class="inline-block rounded-[var(--native-radius-sm)] border border-border-weak-base bg-bg-muted/60 px-2 py-1 text-12-mono text-text-strong">
              {slashCmd()}
            </code>
          </Show>
        </div>
      </div>
    </Show>
  )
}

export default UsageSection
