import { createEffect, onCleanup, onMount } from "solid-js"
import * as echarts from "echarts"
import type { EChartsOption } from "echarts"
import { useLanguage } from "@/context/language"

type Props = {
  option?: EChartsOption
  height?: string
  empty?: string
}

export function ChartCard(props: Props) {
  let el: HTMLDivElement | undefined
  let chart: echarts.ECharts | undefined
  const language = useLanguage()

  onMount(() => {
    if (!el) return
    chart = echarts.init(el)

    const resize = () => chart?.resize()
    if (typeof ResizeObserver === "function") {
      const obs = new ResizeObserver(resize)
      obs.observe(el)
      onCleanup(() => obs.disconnect())
    } else {
      window.addEventListener("resize", resize)
      onCleanup(() => window.removeEventListener("resize", resize))
    }

    onCleanup(() => chart?.dispose())
  })

  createEffect(() => {
    if (!chart) return
    const next = props.option
    if (!next) {
      chart.clear()
      return
    }
    chart.setOption(next, true)
  })

  return (
    <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-3 shadow-[var(--native-shadow-sm)]">
      <div ref={el} class="w-full" style={{ height: props.height ?? "280px" }}>
        {!props.option ? <div class="flex h-full items-center justify-center text-sm text-[var(--native-muted)]">{props.empty ?? language.t("kanban.chart.empty.data")}</div> : null}
      </div>
    </section>
  )
}

export default ChartCard