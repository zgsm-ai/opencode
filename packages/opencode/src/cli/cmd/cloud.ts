import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { cmd } from "./cmd"
import { Global } from "../../global"
import {
  downloadFavoriteItem,
  loadFavoriteItem,
  listFavoriteItems,
  uninstallFavoriteItem,
  unloadFavoriteItem,
  viewFavoriteItem,
  type FavoriteItemType,
} from "../../costrict/cloud/favorite"

function csCloudBin(): string {
  const ext = process.platform === "win32" ? ".exe" : ""
  return path.join(Global.Path.bin, `cs-cloud${ext}`)
}

function runCsCloud(args: string[]): void {
  const bin = csCloudBin()
  if (!fs.existsSync(bin)) {
    console.error(`cs-cloud binary not found: ${bin}`)
    process.exit(1)
  }
  const child = spawn(bin, args, {
    stdio: "inherit",
    windowsHide: true,
  })
  child.on("error", (err) => {
    console.error(`failed to run cs-cloud: ${err.message}`)
    process.exit(1)
  })
  child.on("exit", (code) => {
    process.exit(code !== null ? code : 1)
  })
}

function pad(value: string, width: number) {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

async function printFavoriteList(format: "table" | "json", type?: FavoriteItemType) {
  const items = await listFavoriteItems(type)
  if (format === "json") {
    console.log(JSON.stringify(items, null, 2))
    return
  }

  if (!items.length) {
    console.log("No cloud favorites found")
    return
  }

  const statusWidth = Math.max("Status".length, ...items.map((item) => item.status.length))
  const typeWidth = Math.max("Type".length, ...items.map((item) => item.itemType.length))
  const slugWidth = Math.max("Slug".length, ...items.map((item) => item.slug.length))
  const nameWidth = Math.max("Name".length, ...items.map((item) => item.name.length))

  console.log(
    `${pad("Status", statusWidth)}  ${pad("Type", typeWidth)}  ${pad("Slug", slugWidth)}  ${pad("Name", nameWidth)}  Description`,
  )
  for (const item of items) {
    console.log(
      `${pad(item.status, statusWidth)}  ${pad(item.itemType, typeWidth)}  ${pad(item.slug, slugWidth)}  ${pad(item.name, nameWidth)}  ${item.description}`,
    )
  }
}

async function printFavoriteView(id: string, format: "table" | "json") {
  const item = await viewFavoriteItem(id)
  if (format === "json") {
    console.log(JSON.stringify(item, null, 2))
    return
  }

  console.log(`Name: ${item.name}`)
  console.log(`Slug: ${item.slug}`)
  console.log(`ID: ${item.id}`)
  console.log(`Type: ${item.itemType}`)
  console.log(`Status: ${item.status}`)
  console.log(`Favorites: ${item.favoriteCount ?? 0}`)
  if (item.version) console.log(`Version: ${item.version}`)
  if (item.localPath) console.log(`Local path: ${item.localPath}`)
  console.log("")
  console.log(item.description || "(no description)")
}

function printFavoriteHelp() {
  console.log(`cs cloud favorite

Manage costrict-web favorite items (skills, agents, commands, MCPs).

Usage:
  cs cloud favorite list [--type skill|agent|command|mcp] [--format table|json]
  cs cloud favorite view <slug-or-id> [--format table|json]
  cs cloud favorite download <slug-or-id>
  cs cloud favorite load <slug-or-id>
  cs cloud favorite unload <slug-or-id>
  cs cloud favorite uninstall <slug-or-id>
  cs cloud favorite --help

Commands:
  list       List cloud favorite items
  view       Show favorite item details
  download   Download favorite item to local storage
  load       Enable a downloaded favorite item without restart
  unload     Disable a favorite item without restart
  uninstall  Remove a local favorite item without restart

Supported types:
  skill      Skill instructions (SKILL.md)
  agent      Subagent definitions (agent markdown)
  command    Command templates (command markdown)
  mcp        MCP server configurations (JSON config)

Status flow:
  Cloud -> Downloaded -> Active -> Unloaded

State transition rules:
  download   Cloud/Unloaded -> Downloaded
  load       Cloud/Downloaded/Unloaded -> Active
  unload     Active -> Unloaded
  uninstall  Downloaded/Active/Unloaded -> Cloud
`)
}

async function runFavoriteAction(action: "download" | "load" | "unload" | "uninstall", id: string) {
  switch (action) {
    case "download": {
      const item = await downloadFavoriteItem(id)
      console.log(`downloaded ${item.slug}`)
      return
    }
    case "load": {
      const item = await loadFavoriteItem(id)
      console.log(`loaded ${item.slug} as active without restart`)
      return
    }
    case "unload": {
      const item = await unloadFavoriteItem(id)
      console.log(`unloaded ${item.slug} without restart`)
      return
    }
    case "uninstall": {
      const item = await uninstallFavoriteItem(id)
      console.log(`uninstalled ${item.slug} without restart`)
      return
    }
  }
}

export const CloudCommand = cmd({
  command: "cloud [command]",
  describe: "manage cloud daemon (register device and connect via WebSocket tunnel)",
  builder: (yargs) =>
    yargs
      .command("start", "start cloud daemon", {}, () => {
        runCsCloud(["start"])
      })
      .command("stop", "stop cloud daemon", {}, () => {
        runCsCloud(["stop"])
      })
      .command("status", "show cloud daemon status", {}, () => {
        runCsCloud(["status"])
      })
      .command(
        "logs",
        "tail cloud daemon logs",
        (y) =>
          y
            .option("lines", { alias: "n", type: "number", default: 100, describe: "number of lines to show" })
            .option("follow", { alias: "f", type: "boolean", default: false, describe: "follow log output" }),
        (args) => {
          const pass = ["logs"]
          if (args.lines) pass.push("-n", String(args.lines))
          if (args.follow) pass.push("-f")
          runCsCloud(pass)
        },
      )
      .command("restart", "restart cloud daemon", {}, () => {
        runCsCloud(["restart"])
      })
      .command(
        "favorite <command> [id]",
        "manage costrict-web favorite items (skills, agents, commands, MCPs)",
        (y) =>
          y
            .positional("command", {
              type: "string",
              choices: ["list", "view", "download", "load", "unload", "uninstall", "help"],
            })
            .positional("id", {
              type: "string",
              describe: "favorite item slug or item id",
            })
            .option("format", {
              type: "string",
              choices: ["table", "json"],
              default: "table",
              describe: "output format",
            })
            .option("type", {
              type: "string",
              choices: ["skill", "agent", "command", "mcp"],
              describe: "filter by item type",
            }),
        async (args) => {
          const command = String(args.command)
          const format = (args.format ?? "table") as "table" | "json"
          const type = args.type as FavoriteItemType | undefined

          if (command === "help") {
            printFavoriteHelp()
            return
          }

          if (command === "list") {
            await printFavoriteList(format, type)
            return
          }

          const id = String(args.id ?? "").trim()
          if (!id) {
            console.error("favorite id/slug is required")
            process.exit(1)
          }

          if (command === "view") {
            await printFavoriteView(id, format)
            return
          }

          await runFavoriteAction(command as "download" | "load" | "unload" | "uninstall", id)
        },
      ),
  handler: async () => {
    console.error("specify a subcommand: start, stop, restart, status, logs, favorite")
    process.exit(1)
  },
})
