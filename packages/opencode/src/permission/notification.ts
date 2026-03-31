import { z } from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import { TuiEvent } from "@/cli/cmd/tui/event"
import { Global } from "@/global"
import path from "path"
import { Filesystem } from "@/util/filesystem"

export namespace NotificationMode {
  const Event = {
    Toggled: BusEvent.define("notification.toggled", z.object({ enabled: z.boolean() })),
  }

  const state = Instance.state(() => ({ enabled: true }))

  export function toggle() {
    const s = state()
    s.enabled = !s.enabled
    Bus.publish(Event.Toggled, { enabled: s.enabled })
    return s.enabled
  }

  export function isEnabled() {
    return state().enabled
  }

  export function setEnabled(enabled: boolean) {
    const s = state()
    s.enabled = enabled
    Bus.publish(Event.Toggled, { enabled })
  }

  export async function init() {
    try {
      const kv = await Filesystem.readJson<Record<string, unknown>>(path.join(Global.Path.state, "kv.json"))
      if (kv.notification_mode !== undefined) {
        setEnabled(Boolean(kv.notification_mode))
      }
    } catch {}

    Bus.subscribe(TuiEvent.CommandExecute, (evt) => {
      if (evt.properties.command === "notification.toggle") {
        toggle()
      }
    })
  }
}
