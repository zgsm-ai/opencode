import { Global } from "../global"
import { Log } from "../util/log"
import path from "path"
import z from "zod"
import { Installation } from "../installation"
import { Flag } from "../flag/flag"
import { lazy } from "@/util/lazy"

// Try to import bundled snapshot (generated at build time)
// Falls back to undefined in dev mode when snapshot doesn't exist
/* @ts-ignore */

export namespace ModelsDev {
  const log = Log.create({ service: "models.dev" })
  const filepath = path.join(Global.Path.cache, "models.json")
  const glmProvider: Provider = {
    id: "ai-code-glm",
    name: "AI Code 测评 GLM 服务",
    api: "http://10.72.1.37:8510/v1",
    npm: "@ai-sdk/openai-compatible",
    env: [],
    models: {
      "glm-4.7": {
        id: "glm-4.7",
        name: "GLM-4.7",
        release_date: "2026-02-28",
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        interleaved: {
          field: "reasoning_content",
        },
        limit: {
          context: 200000,
          output: 10240,
        },
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        options: {},
      },
    },
  }
  const glm5Provider: Provider = {
    id: "ai-code-glm-5",
    name: "AI Code 测评 GLM-5 服务",
    api: "http://10.72.1.36:6688/v1",
    npm: "@ai-sdk/openai-compatible",
    env: [],
    models: {
      "glm-5": {
        id: "glm-5",
        name: "GLM-5",
        release_date: "2026-02-11",
        attachment: false,
        reasoning: true,
        temperature: true,
        tool_call: true,
        interleaved: {
          field: "reasoning_content",
        },
        limit: {
          context: 204800,
          output: 131072,
        },
        modalities: {
          input: ["text"],
          output: ["text"],
        },
        options: {},
      },
    },
  }

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z
          .object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          })
          .strict(),
      ])
      .optional(),
    cost: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
        context_over_200k: z
          .object({
            input: z.number(),
            output: z.number(),
            cache_read: z.number().optional(),
            cache_write: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    experimental: z.boolean().optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()).optional(),
    provider: z.object({ npm: z.string() }).optional(),
    variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
  })

  export type Provider = z.infer<typeof Provider>

  function url() {
    return Flag.OPENCODE_MODELS_URL || "https://models.dev"
  }

  export const Data = lazy(async () => {
    const file = Bun.file(filepath)
    const result = await file.json().catch(() => {})
    if (result) return result
    // @ts-ignore
    const snapshot = await import("./models-snapshot")
      .then((m) => m.snapshot as Record<string, unknown>)
      .catch(() => undefined)
    if (snapshot) return snapshot
    const disableFetch =
      Flag.COSTRICT_DISABLE_MODELS_FETCH || Flag.OPENCODE_DISABLE_MODELS_FETCH
    if (disableFetch) return {}
    const json = await fetch(`${url()}/api.json`).then((x) => x.text())
    return JSON.parse(json)
  })

  export async function get() {
    const result = (await Data()) as Record<string, Provider>
    return {
      ...result,
      ...(result["ai-code-glm"] ? {} : { "ai-code-glm": glmProvider }),
      ...(result["ai-code-glm-5"] ? {} : { "ai-code-glm-5": glm5Provider }),
    }
  }

  export async function refresh() {
    const disableFetch =
      Flag.COSTRICT_DISABLE_MODELS_FETCH || Flag.OPENCODE_DISABLE_MODELS_FETCH
    if (disableFetch) return
    const file = Bun.file(filepath)
    const result = await fetch(`${url()}/api.json`, {
      headers: {
        "User-Agent": Installation.USER_AGENT,
      },
      signal: AbortSignal.timeout(10 * 1000),
    }).catch((e) => {
      log.error("Failed to fetch models.dev", {
        error: e,
      })
    })
    if (result && result.ok) {
      await Bun.write(file, await result.text())
      ModelsDev.Data.reset()
    }
  }
}

const disableFetch =
  Flag.COSTRICT_DISABLE_MODELS_FETCH || Flag.OPENCODE_DISABLE_MODELS_FETCH
if (!disableFetch) {
  ModelsDev.refresh()
  setInterval(
    async () => {
      await ModelsDev.refresh()
    },
    60 * 1000 * 60,
).unref()
}
