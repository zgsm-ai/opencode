import { createSignal } from "solid-js"

const [opened, set] = createSignal(false)

export const drawer = {
  opened,
  toggle: () => set((v) => !v),
  hide: () => set(false),
}
