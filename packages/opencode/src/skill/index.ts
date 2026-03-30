import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import type { Agent } from "@/agent/agent"
import { Bus } from "@/bus"
import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Permission } from "@/permission"
import { Filesystem } from "@/util/filesystem"
import { Instance } from "@/project/instance"
import { Config } from "../config/config"
import { ConfigMarkdown } from "../config/markdown"
import { Glob } from "../util/glob"
import { Log } from "../util/log"
import { Discovery } from "./discovery"

export namespace Skill {
  const log = Log.create({ service: "skill" })
  const EXTERNAL_DIRS = [".claude", ".agents"]
  const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
  const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
  const SKILL_PATTERN = "**/SKILL.md"

  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
    content: z.string(),
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
    }),
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
  )

  type State = {
    skills: Record<string, Info>
    dirs: Set<string>
  }

  async function add(state: State, match: string) {
    const md = await ConfigMarkdown.parse(match).catch(async (err) => {
      const message = ConfigMarkdown.FrontmatterError.isInstance(err)
        ? err.data.message
        : `Failed to parse skill ${match}`
      const { Session } = await import("@/session")
      await Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
      log.error("failed to load skill", { skill: match, err })
      return undefined
    })

    if (!md) return

    const parsed = Info.pick({ name: true, description: true }).safeParse(md.data)
    if (!parsed.success) return

    if (state.skills[parsed.data.name]) {
      log.warn("duplicate skill name", {
        name: parsed.data.name,
        existing: state.skills[parsed.data.name].location,
        duplicate: match,
      })
    }

    state.dirs.add(path.dirname(match))
    state.skills[parsed.data.name] = {
      name: parsed.data.name,
      description: parsed.data.description,
      location: match,
      content: md.content,
    }
  }

  async function scan(state: State, root: string, pattern: string, opts?: { dot?: boolean; scope?: string }) {
    const matches = await Glob.scan(pattern, {
      cwd: root,
      absolute: true,
      include: "file",
      symlink: true,
      dot: opts?.dot,
    }).catch((error) => {
      if (!opts?.scope) throw error
      log.error(`failed to scan ${opts.scope} skills`, { dir: root, error })
      return [] as string[]
    })

    await Promise.all(matches.map((match) => add(state, match)))
  }

  async function loadSkills(state: State, directory: string, worktree: string) {
    if (!Flag.OPENCODE_DISABLE_EXTERNAL_SKILLS) {
      for (const dir of EXTERNAL_DIRS) {
        const root = path.join(Global.Path.home, dir)
        const isDir = await Filesystem.isDir(root)
        if (!isDir) continue
        await scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
      }

      const upDirs: string[] = []
      for await (const root of Filesystem.up({
        targets: EXTERNAL_DIRS,
        start: directory,
        stop: worktree,
      })) {
        upDirs.push(root)
      }

      for (const root of upDirs) {
        await scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
      }
    }

    const configDirs = await Config.directories()
    for (const dir of configDirs) {
      await scan(state, dir, OPENCODE_SKILL_PATTERN)
    }

    const cfg = await Config.get()
    for (const item of cfg.skills?.paths ?? []) {
      const expanded = item.startsWith("~/") ? path.join(os.homedir(), item.slice(2)) : item
      const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
      const isDir = await Filesystem.isDir(dir)
      if (!isDir) {
        log.warn("skill path not found", { path: dir })
        continue
      }

      await scan(state, dir, SKILL_PATTERN)
    }

    for (const url of cfg.skills?.urls ?? []) {
      const pulledDirs = await Discovery.pull(url)
      for (const dir of pulledDirs) {
        state.dirs.add(dir)
        await scan(state, dir, SKILL_PATTERN)
      }
    }

    log.info("init", { count: Object.keys(state.skills).length })
  }

  const state = Instance.state(async () => {
    const result: State = { skills: {}, dirs: new Set() }
    await loadSkills(result, Instance.directory, Instance.worktree)
    return result
  })

  export function fmt(list: Info[], opts: { verbose: boolean }) {
    if (list.length === 0) return "No skills are currently available."

    if (opts.verbose) {
      return [
        "<available_skills>",
        ...list.flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${pathToFileURL(skill.location).href}</location>`,
          "  </skill>",
        ]),
        "</available_skills>",
      ].join("\n")
    }

    return ["## Available Skills", ...list.map((skill) => `- **${skill.name}**: ${skill.description}`)].join("\n")
  }

  export async function get(name: string) {
    const s = await state()
    return s.skills[name]
  }

  export async function all() {
    const s = await state()
    return Object.values(s.skills)
  }

  export async function dirs() {
    const s = await state()
    return Array.from(s.dirs)
  }

  export async function available(agent?: Agent.Info) {
    const s = await state()
    const list = Object.values(s.skills).toSorted((a, b) => a.name.localeCompare(b.name))
    if (!agent) return list
    return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
  }
}
