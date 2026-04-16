import { createContext, useContext, type ParentProps } from "solid-js"
import { batch, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useDeviceSDK } from "./device-sdk"
import { useDeviceWorkspace } from "./device-workspace"
import { base64Encode } from "@opencode-ai/util/encode"
import type { ProviderCapability, ProviderCapabilityModel } from "./global-sync/types"

type ModelKey = { providerID: string; modelID: string }

type ModelInfo = ProviderCapabilityModel & {
  provider: { id: string; name?: string }
  latest?: boolean
}

type AgentInfo = {
  name: string
  mode?: string
  hidden?: boolean
  model?: ModelKey
  variant?: string
}

type DeviceLocalValue = {
  slug: () => string
  agent: {
    list: () => AgentInfo[]
    current: () => AgentInfo | undefined
    set: (name: string | undefined) => void
    move: (direction: 1 | -1) => void
  }
  model: {
    ready: () => boolean
    current: () => ModelInfo | undefined
    set: (model: ModelKey | undefined) => void
    list: () => ModelInfo[]
    recent: () => ModelInfo[]
    cycle: (direction: 1 | -1) => void
    visible: (model: ModelKey) => boolean
    setVisibility: (model: ModelKey, visible: boolean) => void
    variant: {
      configured: () => undefined
      selected: () => undefined
      current: () => undefined
      list: () => never[]
      set: (_value: string | undefined) => void
      cycle: () => void
    }
  }
}

const DeviceLocalContext = createContext<DeviceLocalValue>()

export function useDeviceLocal() {
  const ctx = useContext(DeviceLocalContext)
  if (!ctx) throw new Error("useDeviceLocal must be used within DeviceLocalProvider")
  return ctx
}

export { DeviceLocalContext }

export function DeviceLocalProvider(props: ParentProps) {
  const device = useDeviceSDK()
  const sync = useDeviceWorkspace()

  const [store, setStore] = createStore<{
    currentAgent: string | undefined
    currentModel: ModelKey | undefined
  }>({
    currentAgent: undefined,
    currentModel: undefined,
  })

  const agentList = createMemo(() =>
    (sync.data.agent as any[]).filter((x) => x.mode !== "subagent" && !x.hidden),
  )

  const currentAgent = createMemo(() => {
    const list = agentList()
    if (list.length === 0) return undefined
    if (store.currentAgent) {
      const found = list.find((x) => x.name === store.currentAgent)
      if (found) return found
    }
    return list[0]
  })

  const setAgent = (name: string | undefined) => {
    const list = agentList()
    if (list.length === 0) {
      setStore("currentAgent", undefined)
      return
    }
    const match = name ? list.find((x) => x.name === name) : undefined
    const value = match ?? list[0]
    if (!value) return
    batch(() => {
      setStore("currentAgent", value.name)
      if (value.model) {
        setStore("currentModel", value.model)
      }
    })
  }

  const moveAgent = (direction: 1 | -1) => {
    const list = agentList()
    if (list.length === 0) return
    let next = list.findIndex((x) => x.name === store.currentAgent) + direction
    if (next < 0) next = list.length - 1
    if (next >= list.length) next = 0
    setAgent(list[next]?.name)
  }

  const modelList = createMemo<ModelInfo[]>(() => {
    const providers = sync.data.provider.connected as ProviderCapability[]
    if (!providers?.length) return []
    return providers.flatMap((p) =>
      Object.values(p.models).map((m) => ({
        ...m,
        provider: { id: p.id, name: p.name },
      })),
    )
  })

  const currentModel = createMemo<ModelInfo | undefined>(() => {
    const providers = sync.data.provider.connected as ProviderCapability[]
    if (!store.currentModel) {
      for (const p of providers) {
        const defaultModel = p.default_model
        if (defaultModel) {
          const m = p.models[defaultModel]
          if (m) return { ...m, provider: { id: p.id, name: p.name } }
        }
        const first = Object.values(p.models)[0]
        if (first) return { ...first, provider: { id: p.id, name: p.name } }
      }
      return undefined
    }
    const key = store.currentModel
    const provider = providers.find((p) => p.id === key.providerID)
    const m = provider?.models[key.modelID]
    if (!m) return undefined
    return { ...m, provider: { id: provider.id, name: provider.name } }
  })

  const setModel = (model: ModelKey | undefined) => {
    setStore("currentModel", model)
  }

  const value: DeviceLocalValue = {
    slug: () => base64Encode(device.directory),
    agent: {
      list: agentList,
      current: currentAgent,
      set: setAgent,
      move: moveAgent,
    },
    model: {
      ready: () => sync.data.status !== "loading",
      current: currentModel,
      set: setModel,
      list: modelList,
      recent: () => [],
      cycle: () => {},
      visible: () => true,
      setVisibility: () => {},
      variant: {
        configured: () => undefined,
        selected: () => undefined,
        current: () => undefined,
        list: () => [],
        set: () => {},
        cycle: () => {},
      },
    },
  }

  return <DeviceLocalContext.Provider value={value}>{props.children}</DeviceLocalContext.Provider>
}
