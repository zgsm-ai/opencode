import { BusEvent } from "@/bus/bus-event"
import z from "zod"

export const Event = {
  Connected: BusEvent.define("server.connected", z.object({})),
  Disposed: BusEvent.define("global.disposed", z.object({})),
  WorkerRestartSuggested: BusEvent.define(
    "worker.restart.suggested",
    z.object({
      reason: z.enum(["memory"]),
      rssMB: z.string(),
      heapMB: z.string(),
      threshold: z.number(),
    }),
  ),
}
