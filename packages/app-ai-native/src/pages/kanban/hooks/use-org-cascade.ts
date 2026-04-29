import { createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { listOrgs } from "../lib/api"
import { normalizeDateRange } from "../lib/date-range"
import type { DateRangeValue, OrgCascadeValue, OrgLevel } from "../lib/types"

const order: OrgLevel[] = ["org1", "org2", "org3", "org4"]

function makeLabels(t: (key: string) => string): Record<OrgLevel, string> {
  return {
    org1: t("kanban.org.level1"),
    org2: t("kanban.org.level2"),
    org3: t("kanban.org.level3"),
    org4: t("kanban.org.level4"),
  }
}

function cleanValue(input: OrgCascadeValue) {
  const value = Object.fromEntries(
    Object.entries(input).filter(([, item]) => typeof item === "string" && item.trim()),
  ) as OrgCascadeValue

  return order.reduce((next, level, index) => {
    if (index > 0 && !next[order[index - 1]]) return next
    if (value[level]) next[level] = value[level]
    return next
  }, {} as OrgCascadeValue)
}

function parentOf(level: OrgLevel, value: OrgCascadeValue) {
  const index = order.indexOf(level)
  if (index <= 0) return ""
  return order.slice(0, index).map((key) => value[key]).filter(Boolean).join("/")
}

type UseOrgCascadeOptions = {
  value?: OrgCascadeValue
  dateRange?: DateRangeValue
  onChange?: (value: OrgCascadeValue) => void
  t?: (key: string) => string
}

export function useOrgCascade(props: UseOrgCascadeOptions = {}) {
  const [state, setState] = createStore({
    value: {} as OrgCascadeValue,
    options: {
      org1: [] as string[],
      org2: [] as string[],
      org3: [] as string[],
      org4: [] as string[],
    },
    loading: {
      org1: false,
      org2: false,
      org3: false,
      org4: false,
    },
  })

  let token = 0
  let syncGen = 0
  let syncing = false

  const loadLevel = async (level: OrgLevel, parent = "") => {
    const current = ++token
    setState("loading", level, true)
    try {
      const data = await listOrgs({ level, parent, dateRange: props.dateRange }).catch(() => [] as string[])
      if (current !== token) return [] as string[]
      setState("options", level, data)
      return data
    } finally {
      if (current === token) setState("loading", level, false)
    }
  }

  const sync = async (value: OrgCascadeValue = {}) => {
    const gen = ++syncGen
    ++token // cancel any in-progress loadLevel calls
    syncing = true
    const next = cleanValue(value)
    setState("value", next)
    setState("options", "org2", [])
    setState("options", "org3", [])
    setState("options", "org4", [])

    const first = await loadLevel("org1")
    if (gen !== syncGen) return
    if (next.org1 && first.includes(next.org1)) {
      const second = await loadLevel("org2", next.org1)
      if (gen !== syncGen) return
      if (next.org2 && second.includes(next.org2)) {
        const third = await loadLevel("org3", `${next.org1}/${next.org2}`)
        if (gen !== syncGen) return
        if (next.org3 && third.includes(next.org3)) {
          await loadLevel("org4", `${next.org1}/${next.org2}/${next.org3}`)
        }
      }
    }
    syncing = false
  }

  createEffect(() => {
    const signature = JSON.stringify({
      value: props.value ?? {},
      dateRange: normalizeDateRange(props.dateRange),
    })
    void signature
    void sync(props.value ?? {})
  })

  const emit = (value: OrgCascadeValue) => {
    if (syncing) return
    props.onChange?.(cleanValue(value))
  }

  const setLevel = async (level: OrgLevel, value: string) => {
    // User-initiated: cancel any in-progress sync so emit is never blocked
    ++syncGen
    syncing = false

    const index = order.indexOf(level)
    const next = { ...state.value, [level]: value || undefined } as OrgCascadeValue
    for (const lower of order.slice(index + 1)) {
      next[lower] = undefined
      setState("options", lower, [])
    }
    setState("value", next)

    const child = order[index + 1]
    if (child && value) {
      await loadLevel(child, parentOf(child, next))
    }

    emit(next)
  }

  const reset = async () => {
    await sync({})
    emit({})
  }

  const reload = async () => {
    await sync(state.value)
  }

  const levels = createMemo(() =>
    order.map((level, index) => ({
      level,
      label: makeLabels(props.t ?? ((k: string) => k))[level],
      value: state.value[level] ?? "",
      options: state.options[level],
      loading: state.loading[level],
      disabled: index > 0 && order.slice(0, index).some((key) => !state.value[key]),
    })),
  )

  return {
    levels,
    value: () => cleanValue(state.value),
    setLevel,
    reset,
    reload,
  }
}

export default useOrgCascade