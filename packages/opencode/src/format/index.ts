import path from "path"
import z from "zod"
import { mergeDeep } from "remeda"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { Process } from "../util/process"
import * as Formatter from "./formatter"

export namespace Format {
  const log = Log.create({ service: "format" })

  export const Status = z
    .object({
      name: z.string(),
      extensions: z.string().array(),
      enabled: z.boolean(),
    })
    .meta({
      ref: "FormatterStatus",
    })
  export type Status = z.infer<typeof Status>

  type State = {
    formatters: Record<string, Formatter.Info>
    enabled: Record<string, boolean>
  }

  async function buildState(): Promise<State> {
    const enabled: Record<string, boolean> = {}
    const formatters: Record<string, Formatter.Info> = {}
    const cfg = await Config.get()

    if (cfg.formatter !== false) {
      for (const item of Object.values(Formatter)) {
        formatters[item.name] = item
      }

      for (const [name, item] of Object.entries(cfg.formatter ?? {}) as Array<[string, any]>) {
        if (item?.disabled) {
          delete formatters[name]
          continue
        }

        const info = mergeDeep(formatters[name] ?? {}, {
          command: [],
          extensions: [],
          ...item,
        }) as Formatter.Info

        if (info.command.length === 0) continue

        formatters[name] = {
          ...info,
          name,
          enabled: async () => true,
        }
      }
    } else {
      log.info("all formatters are disabled")
    }

    log.info("init")
    return { formatters, enabled }
  }

  const state = Instance.state(buildState)

  async function isEnabled(s: State, item: Formatter.Info) {
    let status = s.enabled[item.name]
    if (status === undefined) {
      status = await item.enabled()
      s.enabled[item.name] = status
    }
    return status
  }

  async function getFormatters(ext: string) {
    const s = await state()
    const matching = Object.values(s.formatters).filter((item) => item.extensions.includes(ext))
    const checks = await Promise.all(
      matching.map(async (item) => {
        log.info("checking", { name: item.name, ext })
        const on = await isEnabled(s, item)
        if (on) log.info("enabled", { name: item.name, ext })
        return {
          item,
          enabled: on,
        }
      }),
    )
    return checks.filter((x) => x.enabled).map((x) => x.item)
  }

  export async function init() {
    await state()
  }

  export async function status() {
    const s = await state()
    const result: Status[] = []

    for (const formatter of Object.values(s.formatters)) {
      result.push({
        name: formatter.name,
        extensions: formatter.extensions,
        enabled: await isEnabled(s, formatter),
      })
    }

    return result
  }

  export async function file(filepath: string) {
    log.info("formatting", { file: filepath })
    const ext = path.extname(filepath)

    for (const item of await getFormatters(ext)) {
      log.info("running", { command: item.command })
      const cmd = item.command.map((x) => x.replace("$FILE", filepath))
      const out = await Process.run(cmd, {
        cwd: Instance.directory,
        env: item.environment,
        nothrow: true,
      }).catch((error) => {
        log.error("failed to format file", {
          error,
          command: item.command,
          ...item.environment,
          file: filepath,
        })
        return undefined
      })

      if (!out || out.code === 0) continue

      log.error("failed", {
        command: item.command,
        ...item.environment,
        code: out.code,
      })
    }
  }
}
