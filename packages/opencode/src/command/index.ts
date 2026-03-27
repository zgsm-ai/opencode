import { BusEvent } from "@/bus/bus-event"
import { SessionID, MessageID } from "@/session/schema"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Identifier } from "../id/id"
import { CostrictCommand } from "../costrict/command"
import PROMPT_REVIEW from "./template/review.txt"
import { MCP } from "../mcp"
import { getCommands } from "../plugin/tdd"
import { Skill } from "../skill/skill"
import { LearningCommands } from "../costrict/command/learning"

export namespace Command {
  export const Event = {
    Executed: BusEvent.define(
      "command.executed",
      z.object({
        name: z.string(),
        sessionID: SessionID.zod,
        arguments: z.string(),
        messageID: MessageID.zod,
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
      skill: z.boolean().optional(),
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
    SECURITY_REVIEW: "security-review",
  } as const

  const state = Instance.state(async () => {
    const cfg = await Config.get()
    const lang = cfg.promptLanguage

    const result: Record<string, Info> = {
      [Default.INIT]: {
        name: Default.INIT,
        description: "create/update AGENTS.md",
        source: "command",
        get template() {
          return CostrictCommand.get("enhanced-initialize", lang).replace("${path}", Instance.worktree)
        },
        hints: hints(CostrictCommand.get("enhanced-initialize", lang)),
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
          return CostrictCommand.get("project-wiki", lang).replace(/\$\{path\}/g, Instance.worktree)
        },
        hints: hints(CostrictCommand.get("project-wiki", lang)),
      },
      [Default.SECURITY_REVIEW]: {
        name: Default.SECURITY_REVIEW,
        description: "perform code security audit",
        get template() {
          return CostrictCommand.get("security-review", lang)
        },
        hints: hints(CostrictCommand.get("security-review", lang)),
      },
      // Learning commands - registered from LearningCommands module
      ...LearningCommands.getCommands(lang ?? "en"),
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

    // Register builtin skills as commands
    const allSkills = await Skill.all()
    for (const skill of allSkills) {
      // Only register builtin skills (stored in ~/.config/costrict/skills/)
      if (skill.location.includes(".config/costrict/skills")) {
        result[skill.name] = {
          name: skill.name,
          description: skill.description,
          skill: true,
          template: `Please use the skill tool to load the "${skill.name}" skill for this task.`,
          hints: [],
        }
      }
    }

    return result
  })

  export async function get(name: string) {
    return state().then((x) => x[name])
  }

  export async function list() {
    return state().then((x) => Object.values(x))
  }
}
