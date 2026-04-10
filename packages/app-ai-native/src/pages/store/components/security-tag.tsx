import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { SecurityStatus } from "../lib/api"

// [bg at ~0.1 alpha, text at full saturation]
const COLORS: Record<SecurityStatus, [string, string]> = {
  unscanned: ["rgba(156,163,175,0.15)", "rgb(156,163,175)"],
  pending: ["rgba(156,163,175,0.15)", "rgb(156,163,175)"],
  scanning: ["rgba(156,163,175,0.15)", "rgb(156,163,175)"],
  clean: ["rgba(34,197,94,0.12)", "rgb(22,163,74)"],
  low: ["rgba(34,197,94,0.12)", "rgb(22,163,74)"],
  medium: ["rgba(240,159,20,0.12)", "rgb(202,138,4)"],
  high: ["rgba(249,115,22,0.12)", "rgb(234,88,12)"],
  extreme: ["rgba(252,74,74,0.12)", "rgb(220,38,38)"],
  error: ["rgba(156,163,175,0.15)", "rgb(156,163,175)"],
  skipped: ["rgba(156,163,175,0.15)", "rgb(156,163,175)"],
}

const KEYS: Record<SecurityStatus, string> = {
  unscanned: "store.security.unscanned",
  pending: "store.security.pending",
  scanning: "store.security.scanning",
  clean: "store.security.clean",
  low: "store.security.low",
  medium: "store.security.medium",
  high: "store.security.high",
  extreme: "store.security.extreme",
  error: "store.security.error",
  skipped: "store.security.skipped",
}

const PULSE: Set<SecurityStatus> = new Set(["pending", "scanning"])

/** Filled pill tag for security status, styled after severity filter tags. */
export default function SecurityTag(props: { status?: SecurityStatus }) {
  const language = useLanguage()
  const status = () => props.status ?? "unscanned"
  const text = () => language.t(KEYS[status()]).replace(/\.{2,}$/, "")

  return (
    <Show when={props.status}>
      <span
        class="inline-flex items-center justify-center rounded-[10px] px-2.5 py-[2px] text-xs"
        style={{ "background-color": COLORS[status()][0], color: COLORS[status()][1] }}
        title={text()}
      >
        <span class={PULSE.has(status()) ? "animate-pulse" : ""}>{text()}</span>
      </span>
    </Show>
  )
}

export type Verdict = "safe" | "caution" | "reject"

const VERDICT_COLORS: Record<Verdict, [string, string]> = {
  safe: ["rgba(34,197,94,0.12)", "rgb(22,163,74)"],
  caution: ["rgba(240,159,20,0.12)", "rgb(202,138,4)"],
  reject: ["rgba(252,74,74,0.12)", "rgb(220,38,38)"],
}

const VERDICT_KEYS: Record<Verdict, string> = {
  safe: "store.verdict.safe",
  caution: "store.verdict.caution",
  reject: "store.verdict.reject",
}

export function VerdictTag(props: { verdict?: Verdict }) {
  const language = useLanguage()
  const verdict = () => props.verdict ?? "safe"

  return (
    <Show when={props.verdict}>
      <span
        class="inline-flex items-center justify-center rounded-[10px] px-2.5 py-[2px] text-xs"
        style={{ "background-color": VERDICT_COLORS[verdict()][0], color: VERDICT_COLORS[verdict()][1] }}
        title={language.t(VERDICT_KEYS[verdict()])}
      >
        {language.t(VERDICT_KEYS[verdict()])}
      </span>
    </Show>
  )
}
