import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { SyncEvent } from "@/sync"
import { GlobalBus } from "@/bus/global"
import { AsyncQueue } from "@/util/queue"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Config } from "../../config/config"
import { errors } from "../error"
import {
  listFavoriteItems,
  loadFavoriteItem,
  unloadFavoriteItem,
  downloadFavoriteItem,
  uninstallFavoriteItem,
  type FavoriteItemType,
} from "@/costrict/cloud/favorite"
import { syncCloudFavoritesNow, syncCloudFavoritesForList } from "@/costrict/cloud/favorite-sync"

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

async function streamEvents(c: Context, subscribe: (q: AsyncQueue<string | null>) => () => void) {
  return streamSSE(c, async (stream) => {
    const q = new AsyncQueue<string | null>()
    let done = false

    q.push(
      JSON.stringify({
        payload: {
          type: "server.connected",
          properties: {},
        },
      }),
    )

    // Send heartbeat every 10s to prevent stalled proxy streams.
    const heartbeat = setInterval(() => {
      q.push(
        JSON.stringify({
          payload: {
            type: "server.heartbeat",
            properties: {},
          },
        }),
      )
    }, 10_000)

    const stop = () => {
      if (done) return
      done = true
      clearInterval(heartbeat)
      unsub()
      q.push(null)
      log.info("global event disconnected")
    }

    const unsub = subscribe(q)

    stream.onAbort(stop)

    try {
      for await (const data of q) {
        if (data === null) return
        await stream.writeSSE({ data })
      }
    } finally {
      stop()
    }
  })
}

export const GlobalRoutes = lazy(() =>
  new Hono()
    .get(
      "/health",
      describeRoute({
        summary: "Get health",
        description: "Get health information about the OpenCode server.",
        operationId: "global.health",
        responses: {
          200: {
            description: "Health information",
            content: {
              "application/json": {
                schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json({ healthy: true, version: Installation.VERSION })
      },
    )
    .get(
      "/event",
      describeRoute({
        summary: "Get global events",
        description: "Subscribe to global events from the OpenCode system using server-sent events.",
        operationId: "global.event",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      directory: z.string(),
                      payload: BusEvent.payloads(),
                    })
                    .meta({
                      ref: "GlobalEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global event connected")
        c.header("Cache-Control", "no-cache, no-transform")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        return streamEvents(c, (q) => {
          async function handler(event: any) {
            q.push(JSON.stringify(event))
          }
          GlobalBus.on("event", handler)
          return () => GlobalBus.off("event", handler)
        })
      },
    )
    .get(
      "/sync-event",
      describeRoute({
        summary: "Subscribe to global sync events",
        description: "Get global sync events",
        operationId: "global.sync-event.subscribe",
        responses: {
          200: {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: resolver(
                  z
                    .object({
                      payload: SyncEvent.payloads(),
                    })
                    .meta({
                      ref: "SyncEvent",
                    }),
                ),
              },
            },
          },
        },
      }),
      async (c) => {
        log.info("global sync event connected")
        c.header("Cache-Control", "no-cache, no-transform")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")
        return streamEvents(c, (q) => {
          return SyncEvent.subscribeAll(({ def, event }) => {
            // TODO: don't pass def, just pass the type (and it should
            // be versioned)
            q.push(
              JSON.stringify({
                payload: {
                  ...event,
                  type: SyncEvent.versionedType(def.type, def.version),
                },
              }),
            )
          })
        })
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "Get global configuration",
        description: "Retrieve the current global OpenCode configuration settings and preferences.",
        operationId: "global.config.get",
        responses: {
          200: {
            description: "Get global config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Config.getGlobal())
      },
    )
    .patch(
      "/config",
      describeRoute({
        summary: "Update global configuration",
        description: "Update global OpenCode configuration settings and preferences.",
        operationId: "global.config.update",
        responses: {
          200: {
            description: "Successfully updated global config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) => {
        const config = c.req.valid("json")
        const next = await Config.updateGlobal(config)
        return c.json(next)
      },
    )
    .post(
      "/dispose",
      describeRoute({
        summary: "Dispose instance",
        description: "Clean up and dispose all OpenCode instances, releasing all resources.",
        operationId: "global.dispose",
        responses: {
          200: {
            description: "Global disposed",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      async (c) => {
        await Instance.disposeAll()
        GlobalBus.emit("event", {
          directory: "global",
          payload: {
            type: GlobalDisposedEvent.type,
            properties: {},
          },
        })
        return c.json(true)
      },
    )
    .post(
      "/upgrade",
      describeRoute({
        summary: "Upgrade opencode",
        description: "Upgrade opencode to the specified version or latest if not specified.",
        operationId: "global.upgrade",
        responses: {
          200: {
            description: "Upgrade result",
            content: {
              "application/json": {
                schema: resolver(
                  z.union([
                    z.object({
                      success: z.literal(true),
                      version: z.string(),
                    }),
                    z.object({
                      success: z.literal(false),
                      error: z.string(),
                    }),
                  ]),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          target: z.string().optional(),
        }),
      ),
      async (c) => {
        const method = await Installation.method()
        if (method === "unknown") {
          return c.json({ success: false, error: "Unknown installation method" }, 400)
        }
        const target = c.req.valid("json").target || (await Installation.latest(method))
        const result = await Installation.upgrade(method, target)
          .then(() => ({ success: true as const, version: target }))
          .catch((e) => ({ success: false as const, error: e instanceof Error ? e.message : String(e) }))
        if (result.success) {
          GlobalBus.emit("event", {
            directory: "global",
            payload: {
              type: Installation.Event.Updated.type,
              properties: { version: target },
            },
          })
          return c.json(result)
        }
        return c.json(result, 500)
      },
    )
    .get(
      "/favorite/skills",
      describeRoute({
        summary: "List favorite items",
        description: "List all cloud favorite items with their current status. Supports filtering by type.",
        operationId: "global.favorite.list",
        responses: {
          200: {
            description: "Favorite items list",
            content: {
              "application/json": {
                schema: resolver(
                  z.array(
                    z.object({
                      id: z.string(),
                      slug: z.string(),
                      name: z.string(),
                      description: z.string(),
                      itemType: z.enum(["skill", "agent", "command", "mcp"]),
                      status: z.enum(["Cloud", "Downloaded", "Active", "Unloaded"]),
                      localPath: z.string().optional(),
                    }),
                  ),
                ),
              },
            },
          },
          ...errors(500),
        },
      }),
      async (c) => {
        try {
          // workspace 的 /hub 面板经 cs-cloud 转发到这里。先同步一次，面板打开
          // 即与 csc 的启用状态一致，不必等后台周期。内部有节流与静默失败。
          await syncCloudFavoritesForList()
          const type = c.req.query("type") as FavoriteItemType | undefined
          const validTypes = ["skill", "agent", "command", "mcp"]
          const items = await listFavoriteItems(type && validTypes.includes(type) ? type : undefined)
          return c.json(items)
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
        }
      },
    )
    .post(
      "/favorite/sync",
      describeRoute({
        summary: "Sync cloud favorites (subscription → active)",
        description:
          "Enable subscribed capability items that were never activated on this device, and re-activate items an admin re-pushed after a local unload. Items the user unloaded without a newer distribution stay disabled. Safe to call repeatedly.",
        operationId: "global.favorite.sync",
        responses: {
          200: {
            description: "Sync result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    enabled: z.array(z.string()),
                    reactivated: z.array(z.string()),
                    errors: z.array(z.object({ slug: z.string(), message: z.string() })),
                  }),
                ),
              },
            },
          },
          ...errors(500),
        },
      }),
      async (c) => {
        try {
          const summary = await syncCloudFavoritesNow()
          return c.json(summary ?? { enabled: [], reactivated: [], errors: [] })
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
        }
      },
    )
    .post(
      "/favorite/skills/:slug/:action",
      describeRoute({
        summary: "Perform favorite item action",
        description: "Load, unload, download, or uninstall a favorite item.",
        operationId: "global.favorite.action",
        responses: {
          200: {
            description: "Action performed successfully",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.literal(true), slug: z.string() })),
              },
            },
          },
          ...errors(400, 500),
        },
      }),
      validator(
        "param",
        z.object({
          slug: z.string(),
          action: z.enum(["load", "unload", "download", "uninstall"]),
        }),
      ),
      async (c) => {
        const { slug, action } = c.req.valid("param")
        try {
          switch (action) {
            case "load":
              try {
                await loadFavoriteItem(slug)
              } catch (loadErr) {
                const msg = loadErr instanceof Error ? loadErr.message : String(loadErr)
                // MCP config format errors: item is already downloaded, but user needs to manually edit the config
                if (msg.includes("MCP configuration") || msg.includes("Unable to recognize MCP")) {
                  return c.json({ success: true as const, slug, needsConfig: true, guidance: msg })
                }
                throw loadErr
              }
              break
            case "unload":
              await unloadFavoriteItem(slug)
              break
            case "download":
              await downloadFavoriteItem(slug)
              break
            case "uninstall":
              await uninstallFavoriteItem(slug)
              break
          }
          return c.json({ success: true as const, slug })
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
        }
      },
    ),
)
