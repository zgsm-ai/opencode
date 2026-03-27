import path from "path"
import { copyFile, mkdir } from "fs/promises"
import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Instance } from "../../project/instance"
import { fetchIndex, resolveToken, invalidateAccessCache, createRegistry, createItem, uploadArtifact } from "../../costrict/registry/client"
import { install, uninstall } from "../../costrict/registry/install"
import * as Record from "../../costrict/registry/record"
import { AlreadyInstalledError, ForbiddenError, NotLoggedInError, UnauthorizedError, PackValidationError, SkillNotFoundError, PackError } from "../../costrict/registry/types"
import type { InstallScope, RegistryItem, CreateRegistryResponse, CreateItemResponse, UploadArtifactResponse, RegistryItemType } from "../../costrict/registry/types"
import { getCoStrictBaseURL } from "../../costrict/provider/auth"
import { validatePlugin, packPlugin, readSkillMarkdown, getPluginMetadata } from "../../costrict/registry/pack"
import { Global } from "../../global"
import { TTYCheck } from "./tui/util/tty-check"

const DEFAULT_ORG = "public"

function registryBase(): string {
  const env = process.env.COSTRICT_REGISTRY_BASE_URL
  if (env) return env.replace(/\/$/, "")
  return `${getCoStrictBaseURL()}/cloud-api`
}

function resolveRegistryUrl(slug: string | undefined): { registryUrl: string; itemSlug: string | undefined } {
  const base = registryBase()

  if (!slug) return { registryUrl: `${base}/api/registry/${DEFAULT_ORG}`, itemSlug: undefined }
  const sep = slug.indexOf("/")
  if (sep === -1) return { registryUrl: `${base}/api/registry/${DEFAULT_ORG}`, itemSlug: slug }
  return { registryUrl: `${base}/api/registry/${slug.slice(0, sep)}`, itemSlug: slug.slice(sep + 1) }
}

function formatError(err: unknown): string {
  if (err instanceof NotLoggedInError) return err.message
  if (err instanceof UnauthorizedError) return err.message
  if (err instanceof ForbiddenError) return err.message
  if (err instanceof AlreadyInstalledError) return err.message
  if (err instanceof PackValidationError) return err.field ? `${err.message} (${err.field})` : err.message
  if (err instanceof SkillNotFoundError) return err.message
  if (err instanceof PackError) return err.message
  return err instanceof Error ? err.message : String(err)
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const unit = units[Math.min(i, units.length - 1)]
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(1)} ${unit}`
}

// 输出错误信息（两种模式都输出）
function errorNonInteractive(message: string, isInteractive: boolean): void {
  console.error(message)
}

// 输出开始信息（对应 spinner 开始，非交互模式始终输出）
function logSpinnerStart(message: string, isInteractive: boolean): void {
  if (!isInteractive) {
    console.log(message)
  }
}

// 输出完成信息（对应 spinner 结束，非交互模式始终输出）
function logSpinnerStop(message: string, isInteractive: boolean, isError?: boolean): void {
  if (!isInteractive) {
    if (isError) {
      console.error(`Error: ${message}`)
    } else {
      console.log(message)
    }
  }
}

// Upload command types and helper functions
interface UploadOptions {
  path: string
  registry?: string
  slug?: string
  name?: string
  type: RegistryItemType
  version: string
  description?: string
  category?: string
}

async function promptForMissingOptions(options: Partial<UploadOptions>, interactive: boolean): Promise<UploadOptions> {
  const resolved = { ...options } as UploadOptions

  // Check if path is provided
  if (!resolved.path) {
    const errorMsg = interactive
      ? "Error: Missing required argument: <path>. Please specify the plugin directory path."
      : "Error: Missing required argument: <path>. Run with --help for usage."
    throw new Error(errorMsg)
  }

  // Resolve absolute path
  resolved.path = path.resolve(resolved.path)

  // Try to read metadata from plugin.json
  let metadata: { slug?: string; name?: string; description?: string; type?: RegistryItemType } = {}
  try {
    const metadataResult = await getPluginMetadata(resolved.path)
    metadata = {
      slug: metadataResult.slug,
      name: metadataResult.name,
      description: metadataResult.description,
      type: metadataResult.type,
    }
  } catch {
    // Ignore errors, will prompt for missing values
  }

  // Helper to get value from prompt or metadata or default
  const getValue = async <T extends string>({
    value,
    metadataValue,
    defaultValue,
    name,
  }: {
    value: T | undefined
    metadataValue: T | undefined
    defaultValue: T
    name: string
  }): Promise<T> => {
    if (value) return value
    if (metadataValue) return metadataValue

    if (!interactive) {
      const errorMsg = `Error: Missing required argument: --${name}. Run with --help for usage.`
      console.error(errorMsg)
      throw new Error(errorMsg)
    }

    return defaultValue
  }

  // Prompt for slug if not provided and not in metadata
  resolved.slug = await getValue({
    value: resolved.slug,
    metadataValue: metadata.slug,
    defaultValue: path.basename(resolved.path),
    name: "slug",
  })

  // Prompt for name if not provided and not in metadata
  resolved.name = await getValue({
    value: resolved.name,
    metadataValue: metadata.name,
    defaultValue: resolved.slug,
    name: "name",
  })

  // Set type with default
  resolved.type = resolved.type || metadata.type || "skill"

  // Set version with default
  resolved.version = resolved.version || "1.0.0"

  // Set optional fields from metadata if available
  if (!resolved.description && metadata.description) {
    resolved.description = metadata.description
  }

  return resolved
}

function formatUploadResult(item: CreateItemResponse, artifact: UploadArtifactResponse): string {
  const lines = [
    `✓ Upload successful!`,
    ``,
    `Item: ${item.slug} (${item.name})`,
    `Type: ${item.itemType}`,
    `Version: ${item.version}`,
    `Artifact ID: ${artifact.id}`,
    `File: ${artifact.filename} (${(artifact.fileSize / 1024).toFixed(1)} KB)`,
  ]
  return lines.join("\n")
}

async function resolveScope(interactive: boolean): Promise<InstallScope> {
  if (!interactive) return "global"
  const project = Instance.project
  if (project.vcs !== "git") return "global"
  const result = await prompts.select<InstallScope>({
    message: "Install location",
    options: [
      { label: "Global", value: "global", hint: "available in all projects" },
      { label: "Current project", value: "project", hint: Instance.worktree },
    ],
  })
  if (prompts.isCancel(result)) throw new UI.CancelledError()
  return result
}

const PluginAddCommand = cmd({
  command: "add [itemType] [slug]",
  describe: "install an extension from the registry",
  builder: (yargs) =>
    yargs
      .positional("itemType", { type: "string", describe: "type of the item to install" })
      .positional("slug", { type: "string", describe: "extension slug, optionally prefixed with org (org/slug)" })
      .option("global", { type: "boolean", alias: "g", describe: "install globally" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()

        const { registryUrl, itemSlug } = resolveRegistryUrl(args.slug)

        prompts.intro(`Install extension : ${registryUrl}`)

        const spinner = prompts.spinner()
        spinner.start("Fetching registry...")

        let index
        try {
          index = await fetchIndex(registryUrl)
          spinner.stop(`Found ${index.items.length} extension(s)`)
        } catch (err) {
          spinner.stop("Failed to fetch registry", 1)
          prompts.log.error(formatError(err))
          prompts.outro("Done")
          return
        }

        if (!index.items.length) {
          prompts.log.warn("No extensions available in this registry")
          prompts.outro("Done")
          return
        }

        let item: RegistryItem
        if (itemSlug) {
          const found = index.items.find((i) => i.slug === itemSlug)
          if (!found) {
            prompts.log.error(`Extension not found: ${itemSlug}`)
            prompts.outro("Done")
            return
          }
          item = found
        } else {
          const installed = await Record.all()
          const installedSlugs = new Set(installed.map((i) => i.slug))
          const options = index.items.map((i) => ({
            label: i.name,
            value: i.slug,
            hint: `${i.type}${installedSlugs.has(i.slug) ? " · installed" : ""} — ${i.description}`,
          }))
          const selected = await prompts.select({ message: "Select extension", options })
          if (prompts.isCancel(selected)) throw new UI.CancelledError()
          item = index.items.find((i) => i.slug === selected)!
        }

        const existing = await Record.get(item.slug)
        if (existing) {
          prompts.log.warn(`${item.slug} is already installed. Run: cs plugin update ${item.slug}`)
          prompts.outro("Done")
          return
        }

        const scope: InstallScope = args.global ? "global" : await resolveScope(true)

        const installSpinner = prompts.spinner()
        installSpinner.start(`Installing ${item.name}...`)

        try {
          await install(item, registryUrl, scope)
          await Record.add(Record.make(item, registryUrl, scope))
          installSpinner.stop(`${item.name} installed`)
        } catch (err) {
          installSpinner.stop("Installation failed", 1)
          prompts.log.error(formatError(err))
        }

        prompts.outro("Done")
      },
    })
  },
})

const PluginRemoveCommand = cmd({
  command: "remove <slug>",
  aliases: ["rm"],
  describe: "remove an installed extension",
  builder: (yargs) =>
    yargs.positional("slug", { type: "string", describe: "extension slug", demandOption: true }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("Remove extension")

        const entry = await Record.get(args.slug!)
        if (!entry) {
          prompts.log.error(`${args.slug} is not installed`)
          prompts.outro("Done")
          return
        }

        const spinner = prompts.spinner()
        spinner.start(`Removing ${entry.name}...`)

        try {
          await uninstall(entry)
          await Record.remove(args.slug!)
          spinner.stop(`${entry.name} removed`)
        } catch (err) {
          spinner.stop("Removal failed", 1)
          prompts.log.error(formatError(err))
        }

        prompts.outro("Done")
      },
    })
  },
})

const PluginListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "list installed extensions",
  async handler() {
    UI.empty()
    prompts.intro("Installed extensions")

    const items = await Record.all()
    if (!items.length) {
      prompts.log.warn("No extensions installed")
      prompts.outro("Run: cs plugin add")
      return
    }

    for (const item of items) {
      prompts.log.info(
        `${item.name} ${UI.Style.TEXT_DIM}${item.type} · ${item.scope} · ${item.registry}`,
      )
    }

    prompts.outro(`${items.length} extension(s)`)
  },
})

const PluginUpdateCommand = cmd({
  command: "update [slug]",
  describe: "re-fetch and update an installed extension",
  builder: (yargs) =>
    yargs.positional("slug", { type: "string", describe: "extension slug (omit to update all)" }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("Update extension(s)")

        const all = await Record.all()
        const targets = args.slug ? all.filter((i) => i.slug === args.slug) : all

        if (!targets.length) {
          prompts.log.warn(args.slug ? `${args.slug} is not installed` : "No extensions installed")
          prompts.outro("Done")
          return
        }

        for (const entry of targets) {
          const spinner = prompts.spinner()
          spinner.start(`Updating ${entry.name}...`)

          try {
            await invalidateAccessCache(entry.registry)
            const index = await fetchIndex(entry.registry)
            const item = index.items.find((i) => i.slug === entry.slug)
            if (!item) {
              spinner.stop(`${entry.slug} not found in registry`, 1)
              continue
            }
            await uninstall(entry)
            await install(item, entry.registry, entry.scope)
            await Record.add(Record.make(item, entry.registry, entry.scope))
            spinner.stop(`${entry.name} updated`)
          } catch (err) {
            spinner.stop(`Failed to update ${entry.name}`, 1)
            prompts.log.error(formatError(err))
          }
        }

        prompts.outro("Done")
      },
    })
  },
})

const PluginUploadCommand = cmd({
  command: "upload [itemType] [path]",
  describe: "upload a plugin to the registry",
  builder: (yargs) =>
    yargs
      .positional("itemType", {
        type: "string",
        describe: "plugin type (skill|subagent|command|mcp)",
        demandOption: true,
        choices: ["skill", "subagent", "command", "mcp"]
      })
      .positional("path", { type: "string", describe: "plugin directory path"}),
  async handler(args) {
    const type = args.itemType as RegistryItemType
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        UI.empty()
        prompts.intro("Upload extension")



        // 使用 TTYCheck 更准确地判断交互式环境
        const isInteractive = TTYCheck.canUseTUI()

        const initialOptions: Partial<UploadOptions> = {
          path: args.path,
          registry: "xixing",
          slug: "test",
          name: "type",
          type: type,
          version: "1.0.0",
          description: "1.0.0",
          category: type,
        }

        // Prompt for missing options
        let options: UploadOptions
        try {
          options = await promptForMissingOptions(initialOptions, isInteractive)
        } catch (err) {
          const errorMessage = formatError(err)
          prompts.log.error(errorMessage)
          errorNonInteractive(`Error: ${errorMessage}`, isInteractive)
          prompts.outro("Done")
          return
        }

        prompts.outro("Done")

        // Validate plugin directory
        const validateSpinner = prompts.spinner()
        logSpinnerStart("Validating plugin...", isInteractive)
        validateSpinner.start("Validating plugin...")
        try {
          await validatePlugin(options.path)
          validateSpinner.stop("Plugin validated")
          logSpinnerStop("Plugin validated", isInteractive)
        } catch (err) {
          validateSpinner.stop("Validation failed", 1)
          const errorMessage = formatError(err)
          prompts.log.error(errorMessage)
          errorNonInteractive(`Error: ${errorMessage}`, isInteractive)
          prompts.outro("Done")
          return
        }

        // Pack plugin
        const packSpinner = prompts.spinner()
        logSpinnerStart("Packing plugin...", isInteractive)
        packSpinner.start("Packing plugin...")
        let packResult
        try {
          const tempDir = path.join(Global.Path.cache, "plugin-uploads")
          packResult = await packPlugin(options.path, tempDir)
          
          // Save packed file to local for verification
          const localPackDir = path.join(Global.Path.data, "packed-plugins")
          await mkdir(localPackDir, { recursive: true })
          const localPackPath = path.join(localPackDir, path.basename(packResult.archivePath))
          await copyFile(packResult.archivePath, localPackPath)
          packSpinner.stop(`Plugin packed (${formatBytes(packResult.size)}, saved to: ${localPackPath})`)
          logSpinnerStop(`Plugin packed (${formatBytes(packResult.size)})`, isInteractive)
        } catch (err) {
          packSpinner.stop("Packing failed", 1)
          const errorMessage = formatError(err)
          prompts.log.error(errorMessage)
          errorNonInteractive(`Error: ${errorMessage}`, isInteractive)
          prompts.outro("Done")
          return
        }

        // Read SKILL.md content
        let skillContent = ""
        try {
          skillContent = await readSkillMarkdown(options.path)
        } catch {
          if (options.type === "skill") {
            prompts.log.warn("SKILL.md not found, using empty content")
          }
        }

        // Resolve or create registry
        const registrySpinner = prompts.spinner()
        logSpinnerStart("Resolving registry...", isInteractive)
        registrySpinner.start("Resolving registry...")
        let registry: CreateRegistryResponse

        const baseUrl = registryBase()

        // Create item
        const itemSpinner = prompts.spinner()
        logSpinnerStart("Creating item...", isInteractive)
        itemSpinner.start("Creating item...")
        let item: CreateItemResponse
        try {
          item = await createItem(baseUrl,{
            slug: "cs-writer4",
            itemType: options.type,
            name: "cs-writer4",
            description: options.description || "",
            category: "utilities",
            version: options.version,
            content: skillContent,
            createdBy: "xixing",
            registryId: "00000000-0000-0000-0000-000000000001",
            visibility: "public",
          })
          itemSpinner.stop(`Item created: ${item.slug}`)
          logSpinnerStop(`Item created: ${item.slug}`, isInteractive)
        } catch (err) {
          itemSpinner.stop("Failed to create item", 1)
          const errorMessage = formatError(err)
          prompts.log.error(errorMessage)
          errorNonInteractive(`Error: ${errorMessage}`, isInteractive)
          prompts.outro("Done")
          return
        }

        // Upload artifact
        // const uploadSpinner = prompts.spinner()
        // logSpinnerStart("Uploading artifact...", isInteractive)
        // uploadSpinner.start("Uploading artifact...")
        // let artifact: UploadArtifactResponse
        // try {
        //   const archivePath = packResult.archivePath
        //   artifact = await uploadArtifact(
        //     baseUrl,
        //     item.id,
        //     archivePath,
        //     options.version,
        //     (loaded, total) => {
        //       const percent = Math.round((loaded / total) * 100)
        //       uploadSpinner.message(`Uploading artifact... ${percent}% (${formatBytes(loaded)} / ${formatBytes(total)})`)
        //     }
        //   )
        //   uploadSpinner.stop("Artifact uploaded")
        //   logSpinnerStop("Artifact uploaded", isInteractive)
        // } catch (err) {
        //   uploadSpinner.stop("Failed to upload artifact", 1)
        //   const errorMessage = formatError(err)
        //   prompts.log.error(errorMessage)
        //   errorNonInteractive(`Error: ${errorMessage}`, isInteractive)
        //   prompts.outro("Done")
        //   return
        // }

        // Display success message
        // const resultMessage = formatUploadResult(item, artifact)
        // prompts.log.success(resultMessage)
        prompts.outro("Done")
      },
    })
  },
})

export const PluginCommand = cmd({
  command: "plugin",
  describe: "manage extensions (skills, agents, commands, mcp)",
  builder: (yargs) =>
    yargs
      .command(PluginAddCommand)
      .command(PluginRemoveCommand)
      .command(PluginListCommand)
      .command(PluginUpdateCommand)
      .command(PluginUploadCommand)
      .demandCommand(),
  async handler() {},
})
