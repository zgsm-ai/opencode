import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"

function getUpgradeFailedStderr(err: unknown) {
  if (!(err instanceof Installation.UpgradeFailedError)) return ""
  const cause = err.cause
  const value =
    cause && typeof cause === "object" && "stderr" in cause ? (cause as { stderr?: unknown }).stderr : undefined
  return typeof value === "string" ? value : ""
}

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upgrade cs to the latest or a specific version",
  builder: (yargs: Argv) => {
    return yargs
      .positional("target", {
        describe: "version to upgrade to, for ex '0.1.48' or 'v0.1.48'",
        type: "string",
      })
      .option("method", {
        alias: "m",
        describe: "installation method to use",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      })
  },
  handler: async (args: { target?: string; method?: string }) => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")
    const detectedMethod = await Installation.method()
    const method = (args.method as Installation.Method) ?? detectedMethod
    if (method === "unknown") {
      prompts.log.error(`opencode is installed to ${process.execPath} and may be managed by a package manager`)
      const install = await prompts.select({
        message: "Install anyways?",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
        initialValue: false,
      })
      if (!install) {
        prompts.outro("Done")
        return
      }
    }
    prompts.log.info("Using method: " + method)
    let target: string
    try {
      target = args.target ? args.target.replace(/^v/, "") : await Installation.latest()
    } catch (err) {
      prompts.log.error("Failed to fetch latest version from registry")
      if (err instanceof Error) {
        prompts.log.error(err.message)
      }
      prompts.log.info(
        "Please check your network connection or try specifying a version manually with: opencode upgrade <version>",
      )
      prompts.outro("Done")
      return
    }

    if (Installation.VERSION === target) {
      prompts.log.warn(`opencode upgrade skipped: ${target} is already installed`)
      prompts.outro("Done")
      return
    }

    // Prevent downgrade using shared version comparison function
    const versionComparison = Installation.compareVersions(target, Installation.VERSION)
    if (versionComparison < 0) {
      prompts.log.warn(
        `opencode upgrade skipped: current version ${Installation.VERSION} is newer than target ${target}`,
      )
      prompts.log.info("You are already using the latest available version")
      prompts.outro("Done")
      return
    }

    prompts.log.info(`From ${Installation.VERSION} → ${target}`)
    const spinner = prompts.spinner()
    spinner.start("Upgrading...")
    const err = await Installation.upgrade(method, target).catch((err) => err)
    if (err) {
      spinner.stop("Upgrade failed", 1)
      if (err instanceof Installation.UpgradeFailedError) {
        const stderr = getUpgradeFailedStderr(err)
        // necessary because choco only allows install/upgrade in elevated terminals
        if (method === "choco" && stderr.includes("not running from an elevated command shell")) {
          prompts.log.error("Please run the terminal as Administrator and try again")
        } else {
          prompts.log.error(stderr || err.message)
        }
      } else if (err instanceof Error) prompts.log.error(err.message)
      prompts.outro("Done")
      return
    }
    spinner.stop("Upgrade complete")
    prompts.outro("Done")
  },
}
