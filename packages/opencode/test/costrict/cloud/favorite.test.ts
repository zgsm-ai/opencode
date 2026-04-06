import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "../../../src/global"
import { tmpdir } from "../../fixture/fixture"
import { Filesystem } from "../../../src/util/filesystem"

function createJWT(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.signature`
}

async function readSkillPathsFromConfig(file: string) {
  const exists = await Filesystem.exists(file)
  if (!exists) return [] as string[]
  const text = await Filesystem.readText(file)
  const parsed = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")) as {
    skills?: { paths?: string[] }
  }
  return parsed.skills?.paths ?? []
}

describe("costrict.cloud.favorite", () => {
  let homeTmp: Awaited<ReturnType<typeof tmpdir>>
  let configTmp: Awaited<ReturnType<typeof tmpdir>>
  let originalFetch: typeof fetch
  let originalHome: string | undefined
  let originalConfigPath: string

  beforeEach(async () => {
    homeTmp = await tmpdir()
    configTmp = await tmpdir()
    originalFetch = globalThis.fetch
    originalHome = process.env.COSTRICT_TEST_HOME
    process.env.COSTRICT_TEST_HOME = homeTmp.path

    originalConfigPath = Global.Path.config
    ;(Global.Path as { config: string }).config = configTmp.path

    const authDir = path.join(homeTmp.path, ".costrict", "share")
    await fs.mkdir(authDir, { recursive: true })
    await fs.writeFile(
      path.join(authDir, "auth.json"),
      JSON.stringify({
        id: "opencode",
        name: "Test User",
        access_token: createJWT({
          id: "user-1",
          sub: "user-1",
          exp: Math.floor(Date.now() / 1000) + 60 * 60,
        }),
        refresh_token: createJWT({ exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }),
        machine_id: "machine-1",
        base_url: "https://costrict.test",
        expiry_date: Date.now() + 60 * 60 * 1000,
        updated_at: new Date().toISOString(),
      }),
    )
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    if (originalHome === undefined) delete process.env.COSTRICT_TEST_HOME
    else process.env.COSTRICT_TEST_HOME = originalHome
    ;(Global.Path as { config: string }).config = originalConfigPath
    await homeTmp[Symbol.asyncDispose]()
    await configTmp[Symbol.asyncDispose]()
  })

  test("lists only favorited skills with Cloud status by default", async () => {
    const listResponse = {
      items: [{ id: "skill-1" }, { id: "skill-2" }],
      hasMore: false,
    }
    const details = {
      "skill-1": {
        id: "skill-1",
        slug: "favorite-skill",
        name: "Favorite Skill",
        description: "first favorite",
        itemType: "skill",
        content: "---\nname: favorite-skill\ndescription: first favorite\n---\n",
        favorited: true,
        favoriteCount: 5,
      },
      "skill-2": {
        id: "skill-2",
        slug: "not-favorited-skill",
        name: "Not Favorited",
        description: "second item",
        itemType: "skill",
        content: "---\nname: not-favorited-skill\ndescription: second item\n---\n",
        favorited: false,
        favoriteCount: 1,
      },
    } as const

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/api/items?")) {
        return new Response(JSON.stringify(listResponse), { status: 200 })
      }
      const id = url.split("/").at(-1)!
      return new Response(JSON.stringify(details[id as keyof typeof details]), { status: 200 })
    }) as unknown as typeof fetch

    const { listFavoriteSkills } = await import("../../../src/costrict/cloud/favorite")
    const items = await listFavoriteSkills()

    expect(items).toHaveLength(1)
    expect(items[0]?.slug).toBe("favorite-skill")
    expect(items[0]?.status).toBe("Cloud")
  })

  test("supports Cloud -> Downloaded -> Active -> Unloaded -> Cloud lifecycle", async () => {
    const skill = {
      id: "skill-1",
      slug: "favorite-skill",
      name: "Favorite Skill",
      description: "favorite skill description",
      itemType: "skill",
      content: "---\nname: favorite-skill\ndescription: favorite skill description\n---\n\n# Favorite Skill\n",
      favorited: true,
      favoriteCount: 5,
      version: "1.0.0",
    }

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/api/items?")) {
        return new Response(JSON.stringify({ items: [{ id: skill.id }], hasMore: false }), { status: 200 })
      }
      if (url.endsWith(`/api/items/${skill.id}`)) {
        return new Response(JSON.stringify(skill), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }) as unknown as typeof fetch

    const { Config } = await import("../../../src/config/config")
    const originalInvalidate = Config.invalidate
    const originalGetGlobal = Config.getGlobal
    let invalidateCalls = 0
    const globalConfigFile = path.join(configTmp.path, "opencode.jsonc")
    Config.invalidate = (async (wait = false) => {
      invalidateCalls += 1
      expect(wait).toBe(true)
    }) as typeof Config.invalidate
    Config.getGlobal = (async () => ({
      skills: {
        paths: await readSkillPathsFromConfig(globalConfigFile),
      },
    })) as typeof Config.getGlobal

    try {
      const {
        downloadFavoriteSkill,
        listFavoriteSkills,
        loadFavoriteSkill,
        uninstallFavoriteSkill,
        unloadFavoriteSkill,
      } = await import("../../../src/costrict/cloud/favorite")

      const skillDir = path.join(configTmp.path, "costrict", "cloud-favorites", "skills", skill.slug)
      const skillFile = path.join(skillDir, "SKILL.md")
      const stateFile = path.join(configTmp.path, "costrict", "cloud-favorites", "state.json")
      await downloadFavoriteSkill(skill.slug)
      expect(await fs.readFile(skillFile, "utf8")).toContain("# Favorite Skill")
      expect((await listFavoriteSkills())[0]?.status).toBe("Downloaded")

      await loadFavoriteSkill(skill.slug)
      const activatedConfig = await fs.readFile(globalConfigFile, "utf8")
      expect(activatedConfig).toContain(skillDir)
      const activeConfig = await Config.getGlobal()
      expect(activeConfig.skills?.paths ?? []).toContain(skillDir)
      expect((await listFavoriteSkills())[0]?.status).toBe("Active")

      await unloadFavoriteSkill(skill.slug)
      const unloadedConfig = await fs.readFile(globalConfigFile, "utf8")
      expect(unloadedConfig).not.toContain(skillDir)
      expect((await listFavoriteSkills())[0]?.status).toBe("Unloaded")

      await uninstallFavoriteSkill(skill.slug)
      await expect(fs.stat(skillDir)).rejects.toThrow()
      const state = JSON.parse(await fs.readFile(stateFile, "utf8")) as { items: Record<string, unknown> }
      expect(state.items[skill.slug]).toBeUndefined()
      expect((await listFavoriteSkills())[0]?.status).toBe("Cloud")

      expect(invalidateCalls).toBe(3)
    } finally {
      Config.invalidate = originalInvalidate
      Config.getGlobal = originalGetGlobal
    }
  })

  test("load writes skills.paths and unload removes it", async () => {
    const skill = {
      id: "skill-1",
      slug: "favorite-skill",
      name: "Favorite Skill",
      description: "favorite skill description",
      itemType: "skill",
      content: "---\nname: favorite-skill\ndescription: favorite skill description\n---\n\n# Favorite Skill\n",
      favorited: true,
      favoriteCount: 5,
    }

    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/api/items?")) {
        return new Response(JSON.stringify({ items: [{ id: skill.id }], hasMore: false }), { status: 200 })
      }
      return new Response(JSON.stringify(skill), { status: 200 })
    }) as unknown as typeof fetch

    const { Config } = await import("../../../src/config/config")
    const originalInvalidate = Config.invalidate
    const originalGetGlobal = Config.getGlobal
    const globalConfigFile = path.join(configTmp.path, "opencode.jsonc")
    Config.invalidate = (async () => undefined) as typeof Config.invalidate
    Config.getGlobal = (async () => ({
      skills: {
        paths: await readSkillPathsFromConfig(globalConfigFile),
      },
    })) as typeof Config.getGlobal

    try {
      const { loadFavoriteSkill, unloadFavoriteSkill } = await import("../../../src/costrict/cloud/favorite")
      const skillDir = path.join(configTmp.path, "costrict", "cloud-favorites", "skills", skill.slug)

      await loadFavoriteSkill(skill.slug)
      const parsedActivated = await Filesystem.readJson<{ skills?: { paths?: string[] } }>(globalConfigFile)
      expect(parsedActivated.skills?.paths).toContain(skillDir)

      await unloadFavoriteSkill(skill.slug)
      const parsedUnloaded = await Filesystem.readJson<{ skills?: { paths?: string[] } }>(globalConfigFile)
      expect(parsedUnloaded.skills?.paths ?? []).not.toContain(skillDir)
    } finally {
      Config.invalidate = originalInvalidate
      Config.getGlobal = originalGetGlobal
    }
  })
})
