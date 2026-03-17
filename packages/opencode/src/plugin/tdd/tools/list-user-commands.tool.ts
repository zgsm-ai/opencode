import { tool } from "@opencode-ai/plugin"
import { Config } from "../../../config/config"
import { Skill } from "../../../skill/skill"

async function hints(template: string): Promise<string[]> {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

interface CommandItem {
  name: string
  description: string
  hints: string[]
}

interface SkillItem {
  name: string
  description: string
  location: string
}

export const list_user_commands = tool({
  description:
    "Get a list of user-defined (non-built-in) commands, MCP prompts, and configured skills with their descriptions. Returns categorized list of user-extended commands excluding built-in commands like init, review, and TDD test command.",
  args: {},
  async execute(_args, _context) {
    const cfg = await Config.get()

    // Collect user-defined commands from config
    const commands: CommandItem[] = []
    const commandConfig = cfg.command ?? {}
    for (const [name, cmd] of Object.entries(commandConfig)) {
      const command = cmd as { description?: string; template: string }
      commands.push({
        name,
        description: command.description || "",
        hints: await hints(command.template),
      })
    }

    // Collect MCP prompts
    const mcpPrompts: CommandItem[] = []
    const mcp = await import("../../../mcp").then((mod) => mod.MCP)
    for (const [name, prompt] of Object.entries(await mcp.prompts())) {
      const p = prompt as { description?: string; arguments?: Array<{ name: string }> }
      mcpPrompts.push({
        name,
        description: p.description || "",
        hints: p.arguments?.map((_, i: number) => `$${i + 1}`) ?? [],
      })
    }

    // Collect skills
    const skills: SkillItem[] = await Skill.all()

    // Check if anything is configured
    if (commands.length === 0 && mcpPrompts.length === 0 && skills.length === 0) {
      return "No user-defined commands, MCP prompts, or skills are configured in the project."
    }

    // Format output by category
    const sections: string[] = []

    if (commands.length > 0) {
      const formatted = commands
        .map((cmd) => {
          const hintsStr = cmd.hints.length > 0 ? `\n  Hints: ${cmd.hints.join(", ")}` : ""
          return `- ${cmd.name}: ${cmd.description}${hintsStr}`
        })
        .join("\n")
      sections.push(`## User-defined Commands\n\n${formatted}`)
    }

    if (mcpPrompts.length > 0) {
      const formatted = mcpPrompts
        .map((cmd) => {
          const hintsStr = cmd.hints.length > 0 ? `\n  Hints: ${cmd.hints.join(", ")}` : ""
          return `- ${cmd.name}: ${cmd.description}${hintsStr}`
        })
        .join("\n")
      sections.push(`## MCP Prompts\n\n${formatted}`)
    }

    if (skills.length > 0) {
      const formatted = skills
        .map((skill) => {
          return `- ${skill.name}: ${skill.description}\n  Location: ${skill.location}`
        })
        .join("\n")
      sections.push(`## Skills\n\n${formatted}`)
    }

    return sections.join("\n\n")
  },
})

export default list_user_commands
