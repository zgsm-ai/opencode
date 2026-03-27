import { createSignal, Show } from "solid-js"
import { A } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { artifactApi, type CapabilityItem } from "../lib/api"
import { categoryKey } from "../lib/constants"
import SecurityTag from "./security-tag"
import "./item-card.css"

const TYPE_COLOR: Record<string, string> = {
  skill: "rgb(234,179,8)",
  subagent: "rgb(59,130,246)",
  command: "rgb(34,197,94)",
  mcp: "rgb(168,85,247)",
}

const TYPE_LABEL: Record<string, string> = {
  skill: "✦",
  subagent: "⬡",
  command: ">_",
  mcp: "⬢",
}

function installCmd(item: CapabilityItem) {
  const registry = item.registry?.name || "public"
  return `cs plugin add ${item.itemType} @${registry}/${item.slug}`
}

export default function ItemCard(props: { item: CapabilityItem }) {
  const [copied, setCopied] = createSignal(false)
  const language = useLanguage()
  const color = () => TYPE_COLOR[props.item.itemType] || "text-text-weak"
  const label = () => TYPE_LABEL[props.item.itemType] || "•"
  const latestArtifact = () => props.item.artifacts?.find((a) => a.isLatest) || props.item.artifacts?.[0]
  const orgName = () =>
    props.item.registry?.orgId && props.item.registry.orgId !== "public" ? props.item.registry.orgId : null

  const handleCopy = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    await navigator.clipboard.writeText(installCmd(props.item))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <A
      href={`/store/items/${props.item.id}?type=${props.item.itemType}`}
      class="item-card-glow group flex flex-col rounded-lg border border-border-weak-base bg-background-base cursor-pointer hover:shadow-xs-border-base hover:-translate-y-px active:translate-y-0 transition-all duration-150"
      style={{ "--glow-color": color() }}
    >
      <div class="flex flex-col flex-1 px-4 py-3.5">
        <div class="flex items-start justify-between gap-2 mb-2.5">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-semibold shrink-0" style={{ color: color() }}>
              {label()}
            </span>
            <span class="font-semibold text-sm truncate text-text-strong">{props.item.name}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <Show when={props.item.repoName}>
              <span
                class="text-xs px-1.5 py-0.5 rounded inline-flex items-center font-medium text-text-weak truncate max-w-[120px]"
                style={{ "background-color": "rgba(156,163,175,0.15)" }}
                title={props.item.repoName}
              >
                {props.item.repoName}
              </span>
            </Show>
            <Show when={props.item.sourceType === "archive"}>
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

        <p class="text-xs text-text-weak line-clamp-2 mb-4 flex-1 min-h-[2rem] leading-relaxed">
          {props.item.description}
        </p>

        <div class="flex items-center gap-2 flex-wrap mt-auto">
          <Show when={props.item.category}>
            <span
              class="inline-flex items-center rounded-[10px] px-2.5 py-[2px] text-xs font-medium text-text-weak"
              style={{ "background-color": "rgba(156,163,175,0.15)" }}
            >
              {language.t(categoryKey(props.item.category))}
            </span>
          </Show>
          <Show when={orgName()}>
            <span
              class="inline-flex items-center rounded-[10px] px-2.5 py-[2px] text-xs font-medium text-text-weak"
              style={{ "background-color": "rgba(156,163,175,0.15)" }}
            >
              {orgName()}
            </span>
          </Show>
          <SecurityTag status={props.item.securityStatus} />
          <div class="flex items-center gap-0.5 ml-auto">
            <button
              onClick={handleCopy}
              class="inline-flex items-center justify-center size-6 rounded text-icon-weak cursor-pointer hover:text-icon-strong hover:bg-bg-muted transition-colors duration-150"
              title={language.t("store.itemCard.copyInstall")}
            >
              <Icon name={copied() ? "check-small" : "copy"} size="small" class={copied() ? "text-green-500" : ""} />
            </button>
            <Show when={latestArtifact()}>
              {(artifact) => (
                <a
                  href={artifactApi.downloadUrl(artifact().id)}
                  download=""
                  onClick={(e) => e.stopPropagation()}
                  class="inline-flex items-center justify-center size-6 rounded text-icon-weak cursor-pointer hover:text-icon-strong hover:bg-bg-muted transition-colors duration-150"
                  title={language.t("store.itemCard.downloadLatest")}
                >
                  <Icon name="download" size="small" />
                </a>
              )}
            </Show>
          </div>
        </div>
      </div>
    </A>
  )
}
