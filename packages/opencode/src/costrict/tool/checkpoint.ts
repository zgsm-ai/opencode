import z from "zod"
import { Tool } from "../../tool/tool"
import { GitService } from "@/costrict/tool/service/git"
import { Log } from "@/util/log"
import DESCRIPTION from "./checkpoint.txt"

const log = Log.create({ service: "checkpoint-tool" })

export const CheckpointTool = Tool.define("checkpoint", async () => {
  // Try to initialize GitService, but don't fail if Git is unavailable
  const gitService = await GitService.getInstanceSafe()

  return {
    description: DESCRIPTION,
    parameters: z.object({
      action: z
        .enum(["commit", "list", "show_diff", "restore", "revert"])
        .describe("The checkpoint action to perform"),
      message: z
        .string()
        .describe("Commit message (required when action is 'commit')")
        .optional(),
      commit_hash: z
        .string()
        .describe("Commit hash (required for 'restore', 'show_diff', 'revert' actions)")
        .optional(),
      files: z
        .array(z.string())
        .describe("List of file paths to restore (only for 'restore' action)")
        .optional(),
    }),

    async execute(params, ctx) {
      // Check if service is available
      if (!gitService || !gitService.isAvailable()) {
        return {
          title: "Checkpoint Unavailable",
          output: "Checkpoint feature is unavailable. Git is required for this functionality.\n\nPlease install Git and restart the CLI to use checkpoint features.",
          metadata: {},
        }
      }

      // Validate parameters based on action
      if (params.action === "commit" && !params.message) {
        return {
          title: "Checkpoint Error",
          output: "Error: 'message' parameter is required when action is 'commit'",
          metadata: {},
        }
      }

      if (["restore", "show_diff", "revert"].includes(params.action) && !params.commit_hash) {
        return {
          title: "Checkpoint Error",
          output: `Error: 'commit_hash' parameter is required when action is '${params.action}'`,
          metadata: {},
        }
      }

      try {
        switch (params.action) {
          case "commit": {
            const hash = await gitService.createCheckpoint(params.message!)
            const shortHash = hash.substring(0, 8)
            return {
              title: `Checkpoint Created: ${shortHash}`,
              output: `Checkpoint created successfully!\n\nCommit hash: ${hash}\nMessage: ${params.message}\n\nUse 'checkpoint' with action 'list' to see all checkpoints.`,
              metadata: {},
            }
          }

          case "list": {
            const checkpoints = await gitService.listCheckpoints()
            if (checkpoints.length === 0) {
              return {
                title: "No Checkpoints",
                output: "No checkpoints found. Create your first checkpoint with action 'commit'.",
                metadata: {},
              }
            }

            let output = `Found ${checkpoints.length} checkpoint(s):\n\n`
            for (const checkpoint of checkpoints) {
              const shortHash = checkpoint.hash.substring(0, 8)
              const date = new Date(checkpoint.date).toLocaleString()
              output += `[${shortHash}] ${checkpoint.message}\n`
              output += `  Date: ${date}\n`
              output += `  Full hash: ${checkpoint.hash}\n\n`
            }

            return {
              title: `${checkpoints.length} Checkpoint(s)`,
              output,
              metadata: {},
            }
          }

          case "show_diff": {
            const diff = await gitService.showCheckpointDiff(params.commit_hash!)
            const shortHash = params.commit_hash!.substring(0, 8)

            if (!diff.trim()) {
              return {
                title: `Diff: ${shortHash}`,
                output: `No changes found in checkpoint ${shortHash}`,
                metadata: {},
              }
            }

            return {
              title: `Diff: ${shortHash}`,
              output: `Changes in checkpoint ${params.commit_hash}:\n\n${diff}`,
              metadata: {},
            }
          }

          case "restore": {
            await gitService.restoreCheckpoint(params.commit_hash!, params.files)
            const shortHash = params.commit_hash!.substring(0, 8)

            let output = `Project restored to checkpoint ${shortHash}\n\n`
            if (params.files && params.files.length > 0) {
              output += `Restored files:\n${params.files.map((f) => `  - ${f}`).join("\n")}`
            } else {
              output += `All tracked files have been restored to their state at this checkpoint.\nNote: Untracked files (if any) are preserved.`
            }

            return {
              title: `Restored: ${shortHash}`,
              output,
              metadata: {},
            }
          }

          case "revert": {
            const newHash = await gitService.revertCheckpoint(params.commit_hash!)
            const shortOriginal = params.commit_hash!.substring(0, 8)
            const shortNew = newHash.substring(0, 8)

            return {
              title: `Reverted: ${shortOriginal}`,
              output: `Changes from checkpoint ${shortOriginal} have been reverted.\n\nNew revert commit: ${newHash}\nShort hash: ${shortNew}`,
              metadata: {},
            }
          }

          default:
            return {
              title: "Invalid Action",
              output: `Error: Unknown action '${params.action}'`,
              metadata: {},
            }
        }
      } catch (error: any) {
        log.error("Checkpoint operation failed", { action: params.action, error })
        return {
          title: "Checkpoint Failed",
          output: `Checkpoint operation failed: ${error.message || error}\n\nAction: ${params.action}`,
          metadata: {},
        }
      }
    },
  }
})
