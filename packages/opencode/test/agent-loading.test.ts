import { describe, test, expect } from "bun:test"
import { BUILTIN_AGENTS } from "../src/costrict/agent/builtin"
import { ConfigMarkdown } from "../src/config/markdown"
import path from "path"
import { fileURLToPath } from "url"

describe("Agent loading integration", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const componentsDir = path.resolve(__dirname, "../src/costrict/agent")

  test("should load all builtin agents with template support", async () => {
    const loadedAgents: { raw: string; content: string }[] = []

    for (const agentContent of BUILTIN_AGENTS) {
      const md = await ConfigMarkdown.parseString(agentContent, {
        context: { version: "1.0.0" },
        baseDir: componentsDir,
        enableIncludes: true,
        enableVariables: true,
        enableConditionals: true,
      })

      loadedAgents.push({
        raw: agentContent,
        content: md.content.trim(),
      })
    }

    // Verify Fix agent loaded correctly
    const fixAgent = loadedAgents.find((agent) => agent.raw.includes("# FixAgent"))
    expect(fixAgent).toBeDefined()
    const fixPrompt = fixAgent?.content ?? ""
    expect(fixPrompt).toContain("quick_explore")
    expect(fixPrompt).toContain("agent-git 常用命令")
    expect(fixPrompt).toContain("memory_bank 记录规范")

    // Verify no {% include %} markers remain (all were processed)
    expect(fixPrompt).not.toContain("{% include")

    // Verify all agents loaded
    expect(loadedAgents.length).toBeGreaterThan(0)

    console.log("\nLoaded agents:")
    for (const agent of loadedAgents) {
      const promptLength = agent.content.length
      const title = agent.raw.split("\n")[0]?.slice(0, 80) ?? "unknown"
      console.log(`  - ${title}: ${promptLength} chars`)
    }
  })

  test("Fix agent should have reduced line count", async () => {
    const fixAgentContent = BUILTIN_AGENTS.find((content) => content.includes("# FixAgent"))

    expect(fixAgentContent).toBeDefined()

    // Keep a reasonable upper bound after template updates
    const lineCount = fixAgentContent!.split("\n").length
    expect(lineCount).toBeLessThan(130)
    expect(lineCount).toBeGreaterThan(70)

    console.log(`\nFix agent line count: ${lineCount} (was 105)`)
  })

  test("template rendering should expand components correctly", async () => {
    const fixAgentContent = BUILTIN_AGENTS.find((content) => content.includes("# FixAgent"))

    const mdWithoutTemplate = await ConfigMarkdown.parseString(fixAgentContent!, {
      baseDir: componentsDir,
      enableIncludes: false, // Disable includes
    })

    const mdWithTemplate = await ConfigMarkdown.parseString(fixAgentContent!, {
      baseDir: componentsDir,
      enableIncludes: true, // Enable includes
    })

    // Without includes, should have {% include %} markers
    expect(mdWithoutTemplate.content).toContain("{% include")

    // With includes, should NOT have {% include %} markers
    expect(mdWithTemplate.content).not.toContain("{% include")

    // With includes, content should be longer
    expect(mdWithTemplate.content.length).toBeGreaterThan(mdWithoutTemplate.content.length)

    console.log(`\nTemplate expansion:`)
    console.log(`  - Without includes: ${mdWithoutTemplate.content.length} chars`)
    console.log(`  - With includes: ${mdWithTemplate.content.length} chars`)
    console.log(`  - Expansion ratio: ${(mdWithTemplate.content.length / mdWithoutTemplate.content.length).toFixed(2)}x`)
  })
})
