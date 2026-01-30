import { Tool } from "./tool"
import z from "zod"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"

const parameters = z.object({
  change_id: z.string().describe("The unique identifier for this proposal/change (e.g., 'add-user-auth', 'refactor-api-v2')"),
  summary: z.string().describe("A brief summary of what was accomplished in this proposal"),
})

export const TaskDoneWithChangeIdTool = Tool.define("task_done_with_change_id", async () => {
  return {
    description: `Mark the proposal task as completed and provide the change_id for downstream agents.

This tool should be called when:
1. All proposal documents are created (proposal.md, tasks.md, etc.)
2. The change_id directory structure is complete under proposal/<change_id>/
3. The proposal is ready for review or implementation

The change_id will be extracted and stored for use by downstream agents like CodingAgent.`,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const { change_id, summary } = params

      // Validate change_id format (alphanumeric, hyphens, underscores)
      if (!/^[a-zA-Z0-9_-]+$/.test(change_id)) {
        throw new Error(
          `Invalid change_id "${change_id}". Change ID must only contain letters, numbers, hyphens, and underscores.`
        )
      }

      // Check if proposal directory exists
      const proposalDir = Instance.worktree
        ? `${Instance.worktree}/proposal/${change_id}`
        : `${Instance.directory}/proposal/${change_id}`

      const dir = Bun.file(proposalDir)
      const dirExists = await dir.exists()

      // Build output message
      let output = `✅ Proposal completed successfully!\n\n`
      output += `Change ID: ${change_id}\n`
      output += `Summary: ${summary}\n\n`

      if (dirExists) {
        output += `Proposal directory: ${proposalDir}\n`
        
        // Try to list files in the directory
        try {
          const files: string[] = []
          for await (const entry of Bun.file(proposalDir).stream()) {
            // This is a simplified check - in practice you might want to use
            // bash tool to list directory contents
          }
          output += `\nNext steps:\n`
          output += `1. Review the proposal at ${proposalDir}/proposal.md\n`
          output += `2. Check implementation tasks at ${proposalDir}/tasks.md\n`
          output += `3. Run CodingAgent to implement: costrict-cli run --agent build "Implement ${change_id}"\n`
        } catch {
          // Directory listing failed, continue without it
        }
      } else {
        output += `\n⚠️ Warning: Proposal directory ${proposalDir} not found.\n`
        output += `Make sure to create the proposal files before calling this tool.\n`
      }

      // Emit event to store change_id in session context
      // This allows downstream agents to access the change_id
      Bus.emit({
        type: "proposal.completed",
        properties: {
          sessionID: ctx.sessionID,
          changeID: change_id,
          summary,
        },
      })

      // Store change_id in message metadata for later retrieval
      ctx.metadata({
        title: `Proposal completed: ${change_id}`,
        metadata: {
          changeID: change_id,
          summary,
          proposalDir,
        },
      })

      return {
        title: `Proposal: ${change_id}`,
        metadata: {
          changeID: change_id,
          summary,
          proposalDir,
        },
        output,
      }
    },
  }
})
