import { describe, test, expect } from "bun:test"
import { BUILTIN_AGENTS } from "../src/costrict/agent/builtin"
import { ConfigMarkdown } from "../src/config/markdown"
import path from "path"
import { fileURLToPath } from "url"

describe("Agent loading integration", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const componentsDir = path.resolve(__dirname, "../src/costrict/agent")

  test("should load all builtin agents with template support", async () => {
    const loadedAgents: Record<string, any> = {}

    for (const agentContent of BUILTIN_AGENTS) {
      const md = await ConfigMarkdown.parseString(agentContent, {
        context: { version: "1.0.0" },
        baseDir: componentsDir,
        enableIncludes: true,
        enableVariables: true,
        enableConditionals: true,
      })

      if (md.data) {
        const name = (md.data as any).name || "unknown"
        loadedAgents[name] = {
          data: md.data,
          prompt: md.content.trim(),
        }
      }
    }

    // Verify Fix agent loaded correctly
    expect(loadedAgents["Fix"]).toBeDefined()
    expect(loadedAgents["Fix"].prompt).toContain("checkpoint 工具使用说明")
    expect(loadedAgents["Fix"].prompt).toContain("通用工作原则")
    expect(loadedAgents["Fix"].prompt).toContain("代码审查原则")

    // Verify no {{include:}} markers remain (all were processed)
    expect(loadedAgents["Fix"].prompt).not.toContain("{{include:")

    // Verify all agents loaded
    expect(Object.keys(loadedAgents).length).toBeGreaterThan(0)

    console.log("\nLoaded agents:")
    for (const name of Object.keys(loadedAgents)) {
      const promptLength = loadedAgents[name].prompt.length
      console.log(`  - ${name}: ${promptLength} chars`)
    }
  })

  test("Fix agent should have reduced line count", async () => {
    const fixAgentContent = BUILTIN_AGENTS.find((content) => content.includes('name: Fix'))

    expect(fixAgentContent).toBeDefined()

    // Original fix-agent.txt had 105 lines, new version should be around 90
    const lineCount = fixAgentContent!.split("\n").length
    expect(lineCount).toBeLessThan(105)
    expect(lineCount).toBeGreaterThan(70)

    console.log(`\nFix agent line count: ${lineCount} (was 105)`)
  })

  test("template rendering should expand components correctly", async () => {
    const fixAgentContent = BUILTIN_AGENTS.find((content) => content.includes('name: Fix'))

    const mdWithoutTemplate = await ConfigMarkdown.parseString(fixAgentContent!, {
      baseDir: componentsDir,
      enableIncludes: false, // Disable includes
    })

    const mdWithTemplate = await ConfigMarkdown.parseString(fixAgentContent!, {
      baseDir: componentsDir,
      enableIncludes: true, // Enable includes
    })

    // Without includes, should have {{include:}} markers
    expect(mdWithoutTemplate.content).toContain("{{include:")

    // With includes, should NOT have {{include:}} markers
    expect(mdWithTemplate.content).not.toContain("{{include:")

    // With includes, content should be longer
    expect(mdWithTemplate.content.length).toBeGreaterThan(mdWithoutTemplate.content.length)

    console.log(`\nTemplate expansion:`)
    console.log(`  - Without includes: ${mdWithoutTemplate.content.length} chars`)
    console.log(`  - With includes: ${mdWithTemplate.content.length} chars`)
    console.log(`  - Expansion ratio: ${(mdWithTemplate.content.length / mdWithoutTemplate.content.length).toFixed(2)}x`)
  })
})
