import z from "zod"
import path from "path"
import os from "os"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { NamedError } from "@opencode-ai/util/error"
import { ConfigMarkdown } from "../config/markdown"
import { Log } from "../util/log"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Flag } from "@/flag/flag"
import { Bus } from "@/bus"
import { Session } from "@/session"
import { FileWatcher } from "@/file/watcher"
import { State } from "@/project/state"

export namespace Skill {
  const log = Log.create({ service: "skill" })
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

  // External skill directories to search for (project-level and global)
  // These follow the directory layout used by Claude Code and other agents.
  const EXTERNAL_DIRS = [".claude", ".agents"]
  const EXTERNAL_SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")

  const COSTRICT_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
  const OPENCODE_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
  const SKILL_GLOB = new Bun.Glob("**/SKILL.md")

  const init = async () => {
    const skills: Record<string, Info> = {}
    const dirs = new Set<string>()

    const addSkill = async (match: string) => {
      const md = await ConfigMarkdown.parse(match).catch((err) => {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      })

      if (!md) return

      const parsed = Info.pick({ name: true, description: true }).safeParse(md.data)
      if (!parsed.success) return

      // Warn on duplicate skill names
      if (skills[parsed.data.name]) {
        log.warn("duplicate skill name", {
          name: parsed.data.name,
          existing: skills[parsed.data.name].location,
          duplicate: match,
        })
      }

      dirs.add(path.dirname(match))

      skills[parsed.data.name] = {
        name: parsed.data.name,
        description: parsed.data.description,
        location: match,
        content: md.content,
      }
    }

    const scanExternal = async (root: string, scope: "global" | "project") => {
      return Array.fromAsync(
        EXTERNAL_SKILL_GLOB.scan({
          cwd: root,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
          dot: true,
        }),
      )
        .then((matches) => Promise.all(matches.map(addSkill)))
        .catch((error) => {
          log.error(`failed to scan ${scope} skills`, { dir: root, error })
        })
    }

    // Scan external skill directories (.claude/skills/, .agents/skills/, etc.)
    // Load global (home) first, then project-level (so project-level overwrites)
    if (!Flag.OPENCODE_DISABLE_EXTERNAL_SKILLS) {
      for (const dir of EXTERNAL_DIRS) {
        const root = path.join(Global.Path.home, dir)
        if (!(await Filesystem.isDir(root))) continue
        await scanExternal(root, "global")
      }

      for await (const root of Filesystem.up({
        targets: EXTERNAL_DIRS,
        start: Instance.directory,
        stop: Instance.worktree,
      })) {
        await scanExternal(root, "project")
      }
    }

    // Scan .costrict/skill/ directories
    for (const dir of await Config.directories()) {
      for await (const match of COSTRICT_SKILL_GLOB.scan({
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
      })) {
        await addSkill(match)
      }
    }

    // Scan additional skill paths from config
    const config = await Config.get()
    for (const skillPath of config.skills?.paths ?? []) {
      const expanded = skillPath.startsWith("~/") ? path.join(os.homedir(), skillPath.slice(2)) : skillPath
      const resolved = path.isAbsolute(expanded) ? expanded : path.join(Instance.directory, expanded)
      if (!(await Filesystem.isDir(resolved))) {
        log.warn("skill path not found", { path: resolved })
        continue
      }
      for await (const match of SKILL_GLOB.scan({
        cwd: resolved,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
      })) {
        await addSkill(match)
      }
    }

    return {
      skills,
      dirs: Array.from(dirs),
    }
  }

  export const state = Instance.state(init)

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
          void Skill.invalidateAll()
        }, delay)
      }

      const sub = Bus.subscribe(FileWatcher.Event.Updated, (evt) => {
        const file = Filesystem.normalizePath(evt.properties.file)
        if (!file.endsWith("SKILL.md")) return

        const gclaude = path.join(Global.Path.home, ".claude", "skills")
        const gbase = [
          Global.Path.config,
          path.join(Global.Path.home, ".costrict"),
          path.join(Global.Path.home, ".opencode"),
        ]
        const gskill = gbase.some((dir) => {
          const one = path.join(dir, "skill")
          const two = path.join(dir, "skills")
          return Filesystem.contains(one, file) || Filesystem.contains(two, file)
        })
        const ghit = gskill || Filesystem.contains(gclaude, file)
        if (ghit) {
          schedule()
          return
        }

        if (!Instance.containsPath(file)) return

        const c1 = `${path.sep}.claude${path.sep}skills${path.sep}`
        const c2 = `${path.sep}.costrict${path.sep}skill${path.sep}`
        const c3 = `${path.sep}.costrict${path.sep}skills${path.sep}`
        const c4 = `${path.sep}.opencode${path.sep}skill${path.sep}`
        const c5 = `${path.sep}.opencode${path.sep}skills${path.sep}`
        const hit = file.includes(c1) || file.includes(c2) || file.includes(c3) || file.includes(c4) || file.includes(c5)
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
    return state().then((x) => x.skills[name])
  }

  export async function all() {
    watch()
    return state().then((x) => Object.values(x.skills))
  }

  export async function dirs() {
    return state().then((x) => x.dirs)
  }
}
