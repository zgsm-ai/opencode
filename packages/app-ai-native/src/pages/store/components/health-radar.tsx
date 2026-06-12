import { For } from "solid-js"
import { useTheme } from "@opencode-ai/ui/theme"
import { useLanguage } from "@/context/language"

interface HealthRadarProps {
  signals: {
    freshness: number
    popularity: number
    source_trust: number
    /** Plugin-only; when present the radar renders a 4th (manifest) axis. */
    manifest_completeness?: number
  }
  /** Accent color for the data polygon; falls back to the native primary token. */
  accent?: string
}

type SignalKey = "popularity" | "freshness" | "source_trust" | "manifest_completeness"

interface Axis {
  key: SignalKey
  i18nKey: string
  angle: number
}

// Hand-tuned 3-axis triangle (no manifest signal): keep the original layout.
const AXES_3: Axis[] = [
  { key: "popularity", i18nKey: "store.detail.health.popularity", angle: -90 },
  { key: "freshness", i18nKey: "store.detail.health.freshness", angle: 30 },
  { key: "source_trust", i18nKey: "store.detail.health.source_trust", angle: 150 },
]

// 4-axis diamond (plugins carrying a manifest_completeness signal): popularity
// top, manifest right, freshness bottom, source_trust left.
const AXES_4: Axis[] = [
  { key: "popularity", i18nKey: "store.detail.health.popularity", angle: -90 },
  { key: "manifest_completeness", i18nKey: "store.detail.health.manifest_completeness", angle: 0 },
  { key: "freshness", i18nKey: "store.detail.health.freshness", angle: 90 },
  { key: "source_trust", i18nKey: "store.detail.health.source_trust", angle: 180 },
]

// Layout: generous padding so labels never clip
const PAD_X = 80 // horizontal padding for left/right labels
const PAD_Y = 30 // vertical padding for top/bottom labels
const RADIUS = 65
const CX = PAD_X + RADIUS
const CY = PAD_Y + RADIUS
const WIDTH = 2 * (PAD_X + RADIUS)
const HEIGHT = 2 * (PAD_Y + RADIUS)
const GRID_LEVELS = [0.25, 0.5, 0.75, 1]

function polar(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

type LabelPos = { x: number; y: number; anchor: "start" | "middle" | "end" }

// Label positions: place them outside the chart near each vertex
const LABEL_POS_3: Record<SignalKey, LabelPos> = {
  popularity: { x: CX, y: PAD_Y - 14, anchor: "middle" }, // top center
  freshness: { x: WIDTH - 16, y: CY + RADIUS * 0.6, anchor: "end" }, // bottom right
  source_trust: { x: 16, y: CY + RADIUS * 0.6, anchor: "start" }, // bottom left
  manifest_completeness: { x: CX, y: CY, anchor: "middle" }, // unused in 3-axis
}

// 4-axis labels: top center / right end / bottom center / left start.
const LABEL_POS_4: Record<SignalKey, LabelPos> = {
  popularity: { x: CX, y: PAD_Y - 14, anchor: "middle" }, // top center
  manifest_completeness: { x: WIDTH - 16, y: CY, anchor: "end" }, // right end
  freshness: { x: CX, y: HEIGHT - PAD_Y + 18, anchor: "middle" }, // bottom center
  source_trust: { x: 16, y: CY, anchor: "start" }, // left start
}

export default function HealthRadar(props: HealthRadarProps) {
  const language = useLanguage()
  const theme = useTheme()

  const isDark = () => theme.mode() === "dark"
  const accent = () => props.accent ?? "var(--native-primary)"
  // Grid/axis lines derive from the muted/border tokens; nudge stronger in dark mode.
  const gridColor = () =>
    isDark()
      ? "color-mix(in srgb, var(--native-muted) 45%, var(--native-panel))"
      : "color-mix(in srgb, var(--native-muted) 22%, var(--native-panel))"
  const labelColor = () => "var(--native-muted)"

  // Select the 3- or 4-axis layout based on whether a manifest signal is present.
  const hasManifest = () => props.signals.manifest_completeness != null
  const axes = () => (hasManifest() ? AXES_4 : AXES_3)
  const labelPos = () => (hasManifest() ? LABEL_POS_4 : LABEL_POS_3)

  const value = (key: SignalKey) => props.signals[key] || 0

  const dataPoints = () => axes().map((a) => polar(a.angle, RADIUS * (value(a.key) / 100)))
  const dataPath = () =>
    dataPoints()
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
      .join(" ") + "Z"

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      class="mx-auto block"
      style={{ "max-width": `${WIDTH}px`, height: "auto" }}
    >
      {/* Grid polygons */}
      <For each={GRID_LEVELS}>
        {(level) => {
          const d =
            axes()
              .map((a, i) => {
                const p = polar(a.angle, RADIUS * level)
                return `${i === 0 ? "M" : "L"}${p.x},${p.y}`
              })
              .join(" ") + "Z"
          return <path d={d} fill="none" stroke={gridColor()} stroke-width={1} />
        }}
      </For>

      {/* Axis lines */}
      <For each={axes()}>
        {(a) => {
          const end = polar(a.angle, RADIUS)
          return <line x1={CX} y1={CY} x2={end.x} y2={end.y} stroke={gridColor()} stroke-width={1} />
        }}
      </For>

      {/* Data polygon */}
      <path
        d={dataPath()}
        fill={`color-mix(in srgb, ${accent()} 15%, transparent)`}
        stroke={accent()}
        stroke-width={2}
      />

      {/* Data dots */}
      <For each={dataPoints()}>{(p) => <circle cx={p.x} cy={p.y} r={3} fill={accent()} />}</For>

      {/* Labels — placed at fixed edge positions */}
      <For each={axes()}>
        {(axis) => {
          const lp = labelPos()[axis.key]
          return (
            <text
              x={lp.x}
              y={lp.y}
              text-anchor={lp.anchor}
              dominant-baseline="middle"
              fill={labelColor()}
              style={{ "font-size": "11px" }}
            >
              {language.t(axis.i18nKey)} ({Math.round(value(axis.key))})
            </text>
          )
        }}
      </For>
    </svg>
  )
}
