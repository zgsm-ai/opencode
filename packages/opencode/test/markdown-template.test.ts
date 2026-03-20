import { describe, test, expect } from "bun:test"
import { ConfigMarkdown } from "../src/config/markdown"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

describe("ConfigMarkdown template engine", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const componentsDir = path.resolve(__dirname, "../src/costrict/agent")

  test("should process includes", async () => {
    const template = `---
name: Test
---
{% include "agent-git-usage.txt" %}`

    const result = await ConfigMarkdown.parseString(template, {
      baseDir: componentsDir,
    })

    expect(result.content).toContain("agent-git 常用命令")
    expect(result.content).toContain("agent-git --no-pager log -5")
  })

  test("should replace variables", async () => {
    const template = `---
name: Test
---
Project: {{ projectPath }}
Task: {{ taskPath }}`

    const result = await ConfigMarkdown.parseString(template, {
      context: {
        projectPath: "/home/user/project",
        taskPath: "/home/user/task.md",
      },
    })

    expect(result.content).toContain("Project: /home/user/project")
    expect(result.content).toContain("Task: /home/user/task.md")
  })

  test("should process conditionals - true case", async () => {
    const template = `---
name: Test
---
{% if showRevert %}Revert command available{% endif %}`

    const result = await ConfigMarkdown.parseString(template, {
      context: { showRevert: true },
    })

    expect(result.content).toContain("Revert command available")
  })

  test("should process conditionals - false case", async () => {
    const template = `---
name: Test
---
{% if showRevert %}Revert command available{% endif %}`

    const result = await ConfigMarkdown.parseString(template, {
      context: { showRevert: false },
    })

    expect(result.content).not.toContain("Revert command available")
  })

  test("should handle nested includes", async () => {
    // First create a test component that includes another
    const nestedComponentDir = path.join(componentsDir, "components")
    const testComponentA = path.join(nestedComponentDir, "test-component-a.txt")

    await fs.writeFile(testComponentA, "Component A content")

    const template = `---
name: Test
---
{% include "test-component-a.txt" %}`

    const result = await ConfigMarkdown.parseString(template, {
      baseDir: componentsDir,
    })

    expect(result.content).toContain("Component A content")

    // Cleanup
    await fs.unlink(testComponentA).catch(() => {})
  })

  test("should handle missing includes gracefully", async () => {
    const template = `---
name: Test
---
{% include "non-existent-component.txt" %}`

    const result = await ConfigMarkdown.parseString(template, {
      baseDir: componentsDir,
    })

    expect(result.content).toContain("[ERROR: Cannot include non-existent-component]")
  })

  test("should load fix-agent with components", async () => {
    const fixAgentPath = path.join(componentsDir, "fix-agent.txt")
    const fixAgentContent = await fs.readFile(fixAgentPath, "utf-8")

    const result = await ConfigMarkdown.parseString(fixAgentContent, {
      baseDir: componentsDir,
    })

    // Verify components were included
    expect(result.content).toContain("quick_explore")
    expect(result.content).toContain("agent-git 常用命令")
    expect(result.content).toContain("memory_bank 记录规范")
    expect(result.content).toContain("analyze_code_structure cheatsheet")
  })

  test("renderTemplate should only process variables and conditionals", () => {
    const template = `Project: {{ projectPath }}
{% if enabled %}Feature enabled{% endif %}`

    const rendered = ConfigMarkdown.renderTemplate(template, {
      projectPath: "/test/path",
      enabled: true,
    })

    expect(rendered).toContain("Project: /test/path")
    expect(rendered).toContain("Feature enabled")
  })

  test("should support nested context values", async () => {
    const template = `---
name: Test
---
{% if config.enabled %}Enabled{% endif %}`

    const result = await ConfigMarkdown.parseString(template, {
      context: { config: { enabled: true } },
    })

    expect(result.content).toContain("Enabled")
  })
})
