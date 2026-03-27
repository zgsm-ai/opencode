import { describe, expect, it } from "bun:test"
import type { Agent } from "@/agent/agent"
import { PromptTags } from "./prompt-tags"

function makeAgent(overrides: Partial<Agent.Info> = {}): Agent.Info {
  return {
    name: "general",
    mode: "primary",
    native: true,
    permission: [],
    options: {},
    ...overrides,
  }
}

function makeInput(overrides: Partial<PromptTags.Input> = {}): PromptTags.Input {
  return {
    agent: makeAgent(),
    providerID: "costrict",
    agentPrompt: undefined,
    userSystem: undefined,
    instructionRefs: new Set<string>(),
    commandSource: undefined,
    ...overrides,
  }
}

describe("PromptTags.collect", () => {
  it("returns empty array when there is no customization", () => {
    expect(PromptTags.collect(makeInput())).toEqual([])
  })

  it("returns rulesmodified for local instruction files", () => {
    const tags = PromptTags.collect(
      makeInput({ instructionRefs: new Set(["/project/AGENTS.md"]) }),
    )
    expect(tags).toEqual(["rulesmodified", "promptcustomized"])
  })

  it("returns rulesmodified for remote instruction URLs", () => {
    const tags = PromptTags.collect(
      makeInput({ instructionRefs: new Set(["https://example.com/agents.md"]) }),
    )
    expect(tags).toEqual(["rulesmodified", "promptcustomized"])
  })

  it("returns systempromptmodified for a custom agent prompt", () => {
    const tags = PromptTags.collect(
      makeInput({
        agent: makeAgent({ native: false, name: "ops" }),
        agentPrompt: "You are a custom assistant.",
      }),
    )
    expect(tags).toEqual(["systempromptmodified", "promptcustomized"])
  })

  it("returns systempromptmodified for native prompt override", () => {
    const tags = PromptTags.collect(
      makeInput({
        agent: makeAgent({ promptOverridden: true }),
        agentPrompt: "Customized builtin prompt",
      }),
    )
    expect(tags).toEqual(["systempromptmodified", "promptcustomized"])
  })

  it("returns systempromptmodified only when provider-specific override matches the active provider", () => {
    const tags = PromptTags.collect(
      makeInput({
        providerID: "costrict",
        agent: makeAgent({ promptOverriddenProviders: ["openai", "costrict"] }),
        agentPrompt: "Customized costrict prompt",
      }),
    )
    expect(tags).toEqual(["systempromptmodified", "promptcustomized"])
  })

  it("does not return systempromptmodified for provider-specific override on another provider", () => {
    const tags = PromptTags.collect(
      makeInput({
        providerID: "costrict",
        agent: makeAgent({ promptOverriddenProviders: ["openai"] }),
        agentPrompt: "Default costrict prompt",
      }),
    )
    expect(tags).toEqual([])
  })

  it("returns systempromptmodified for user.system", () => {
    const tags = PromptTags.collect(
      makeInput({ userSystem: "Respond in Chinese." }),
    )
    expect(tags).toEqual(["systempromptmodified", "promptcustomized"])
  })

  it("returns commandcustomized only for config commands", () => {
    const tags = PromptTags.collect(
      makeInput({ commandSource: "config" }),
    )
    expect(tags).toEqual(["commandcustomized", "promptcustomized"])
  })

  it("does not return commandcustomized for builtin, MCP, or skill commands", () => {
    for (const source of ["builtin", "mcp", "skill"]) {
      const tags = PromptTags.collect(makeInput({ commandSource: source }))
      expect(tags).toEqual([])
    }
  })

  it("returns all tags in the expected order", () => {
    const tags = PromptTags.collect(
      makeInput({
        instructionRefs: new Set(["/project/AGENTS.md"]),
        agent: makeAgent({ promptOverridden: true }),
        agentPrompt: "Customized builtin prompt",
        commandSource: "config",
      }),
    )
    expect(tags).toEqual([
      "rulesmodified",
      "systempromptmodified",
      "commandcustomized",
      "promptcustomized",
    ])
  })

  it("does not duplicate systempromptmodified when both agent and user.system match", () => {
    const tags = PromptTags.collect(
      makeInput({
        agent: makeAgent({ native: false, name: "ops" }),
        agentPrompt: "Custom prompt",
        userSystem: "Extra system",
      }),
    )
    expect(tags.filter((tag) => tag === "systempromptmodified")).toHaveLength(1)
  })

  it("keeps promptcustomized as the last tag", () => {
    const tags = PromptTags.collect(
      makeInput({
        instructionRefs: new Set(["/project/AGENTS.md"]),
        commandSource: "config",
      }),
    )
    expect(tags.at(-1)).toBe("promptcustomized")
  })

  it("does not mutate input", () => {
    const refs = new Set(["/project/AGENTS.md"])
    const input = makeInput({ instructionRefs: refs })
    PromptTags.collect(input)
    expect(input.instructionRefs.size).toBe(1)
    expect(input.commandSource).toBeUndefined()
  })
})
