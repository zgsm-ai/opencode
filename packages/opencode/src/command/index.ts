import { BusEvent } from "@/bus/bus-event"
import path from "path"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import PROMPT_INITIALIZE from "../costrict/command/template/enhanced-initialize.txt" // costrict change
import PROMPT_REVIEW from "./template/review.txt"
import PROMPT_PROJECT_WIKI from "../costrict/command/template/project-wiki.txt" // project-wiki command
import PROMPT_HELPER from "./template/helper.txt"
import { MCP } from "../mcp"
import { getCommands } from "../plugin/tdd"
import { Global } from "@/global"
import { Bus } from "@/bus"
import { FileWatcher } from "@/file/watcher"
import { Filesystem } from "@/util/filesystem"
import { State } from "@/project/state"

export namespace Command {
  export const Event = {
    Executed: BusEvent.define(
      "command.executed",
      z.object({
        name: z.string(),
        sessionID: Identifier.schema("session"),
        arguments: z.string(),
        messageID: Identifier.schema("message"),
      }),
    ),
  }

  export const Info = z
    .object({
      name: z.string(),
      description: z.string().optional(),
      agent: z.string().optional(),
      model: z.string().optional(),
      mcp: z.boolean().optional(),
      // workaround for zod not supporting async functions natively so we use getters
      // https://zod.dev/v4/changelog?id=zfunction
      template: z.promise(z.string()).or(z.string()),
      subtask: z.boolean().optional(),
      hints: z.array(z.string()),
      source: z.string().optional(),
    })
    .meta({
      ref: "Command",
    })

  // for some reason zod is inferring `string` for z.promise(z.string()).or(z.string()) so we have to manually override it
  export type Info = Omit<z.infer<typeof Info>, "template"> & { template: Promise<string> | string }

  export function hints(template: string): string[] {
    const result: string[] = []
    const numbered = template.match(/\$\d+/g)
    if (numbered) {
      for (const match of [...new Set(numbered)].sort()) result.push(match)
    }
    if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
    return result
  }

  export const Default = {
    INIT: "init",
    REVIEW: "review",
    TEST: "test",
    PROJECT_WIKI: "project-wiki",
    HELPER: "helper",
  } as const

  const init = async () => {
    const cfg = await Config.get()

    const result: Record<string, Info> = {
      [Default.INIT]: {
        name: Default.INIT,
        description: "create/update AGENTS.md",
        source: "command",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", Instance.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      },
      [Default.REVIEW]: {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        source: "command",
        get template() {
          return PROMPT_REVIEW.replace("${path}", Instance.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      },
      [Default.PROJECT_WIKI]: {
        name: Default.PROJECT_WIKI,
        description: "generate comprehensive project wiki documentation",
        get template() {
          return PROMPT_PROJECT_WIKI.replace(/\$\{path\}/g, Instance.worktree)
        },
        hints: hints(PROMPT_PROJECT_WIKI),
      },
      [Default.HELPER]: {
        name: Default.HELPER,
        description: "generate a skill and command in config",
        get template() {
          return PROMPT_HELPER.replace("${project}", Instance.worktree).replace("${global}", Global.Path.config)
        },
        hints: hints(PROMPT_HELPER),
      },
    }

    const tddCommands = await getCommands()
    for (const [name, command] of Object.entries(tddCommands)) {
      result[name] = command
    }

    for (const [name, command] of Object.entries(cfg.command ?? {})) {
      result[name] = {
        name,
        agent: command.agent,
        model: command.model,
        description: command.description,
        source: "command",
        get template() {
          return command.template
        },
        subtask: command.subtask,
        hints: hints(command.template),
      }
    }
    for (const [name, prompt] of Object.entries(await MCP.prompts())) {
      result[name] = {
        name,
        mcp: true,
        description: prompt.description,
        get template() {
          // since a getter can't be async we need to manually return a promise here
          return new Promise<string>(async (resolve, reject) => {
            const template = await MCP.getPrompt(
              prompt.client,
              prompt.name,
              prompt.arguments
                ? // substitute each argument with $1, $2, etc.
                  Object.fromEntries(prompt.arguments?.map((argument, i) => [argument.name, `$${i + 1}`]))
                : {},
            ).catch(reject)
            resolve(
              template?.messages
                .map((message) => (message.content.type === "text" ? message.content.text : ""))
                .join("\n") || "",
            )
          })
        },
        hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
      }
    }

    return result
  }

  const state = Instance.state(init)

  const watch = Instance.state(
    () => {
      const delay = 200
      const clock = {
        timer: undefined as ReturnType<typeof setTimeout> | undefined,
      }
      const schedule = () => {
        if (clock.timer) clearTimeout(clock.timer)
        clock.timer = setTimeout(() => {
          clock.timer = undefined
          void Config.invalidateAll()
          void Command.invalidateAll()
        }, delay)
      }

      const sub = Bus.subscribe(FileWatcher.Event.Updated, (evt) => {
        const file = Filesystem.normalizePath(evt.properties.file)
        if (!file.endsWith(".md")) return

        const gbase = [
          Global.Path.config,
          path.join(Global.Path.home, ".costrict"),
          path.join(Global.Path.home, ".opencode"),
        ]
        const gcmd = gbase.some((dir) => {
          const one = path.join(dir, "command")
          const two = path.join(dir, "commands")
          return Filesystem.contains(one, file) || Filesystem.contains(two, file)
        })
        if (gcmd) {
          schedule()
          return
        }

        if (!Instance.containsPath(file)) return

        const c1 = `${path.sep}.costrict${path.sep}command${path.sep}`
        const c2 = `${path.sep}.costrict${path.sep}commands${path.sep}`
        const c3 = `${path.sep}.opencode${path.sep}command${path.sep}`
        const c4 = `${path.sep}.opencode${path.sep}commands${path.sep}`
        const hit = file.includes(c1) || file.includes(c2) || file.includes(c3) || file.includes(c4)
        if (!hit) return

        schedule()
      })

      return { sub, clock }
    },
    async (item) => {
      item.sub?.()
      if (item.clock?.timer) clearTimeout(item.clock.timer)
    },
  )

  export async function invalidate() {
    await State.invalidate(Instance.directory, init)
  }

  export async function invalidateAll() {
    await State.invalidateAll(init)
  }

  export async function get(name: string) {
    watch()
    return state().then((x) => x[name])
  }

  export async function list() {
    watch()
    return state().then((x) => Object.values(x))
  }
}
