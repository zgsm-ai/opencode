import { describe, expect, test, mock } from "bun:test"
import { list_user_commands } from "../../../../src/plugin/tdd/tools/list-user-commands.tool"
import { Config } from "../../../../src/config/config"
import { Skill } from "../../../../src/skill/skill"

describe("list-user-commands tool", () => {
  describe("正常场景", () => {
    test("should return formatted output with user-defined commands, MCP prompts, and skills", async () => {
      // Mock Config.get
      mock.module("../../../../src/config/config", () => ({
        Config: {
          get: mock(async () => ({
            command: {
              custom1: {
                description: "Custom command 1",
                template: "echo $1",
              },
              custom2: {
                description: "Custom command 2",
                template: "ls -la $ARGUMENTS",
              },
            },
          })),
        },
      }))

      // Mock Skill.all
      mock.module("../../../../src/skill/skill", () => ({
        Skill: {
          all: mock(async () => [
            {
              name: "skill1",
              description: "Test skill 1",
              location: "/path/to/skill1",
            },
            {
              name: "skill2",
              description: "Test skill 2",
              location: "/path/to/skill2",
            },
          ]),
        },
      }))

      // Mock MCP.prompts
      mock.module("../../../../src/mcp", () => ({
        MCP: {
          prompts: mock(async () => ({
            prompt1: {
              description: "MCP prompt 1",
              arguments: [{ name: "arg1" }, { name: "arg2" }],
            },
            prompt2: {
              description: "MCP prompt 2",
              arguments: [],
            },
          })),
        },
      }))

      const result = await list_user_commands.execute({}, {} as any)

      expect(result).toContain("## User-defined Commands")
      expect(result).toContain("custom1")
      expect(result).toContain("Custom command 1")
      expect(result).toContain("custom2")
      expect(result).toContain("Custom command 2")

      expect(result).toContain("## MCP Prompts")
      expect(result).toContain("prompt1")
      expect(result).toContain("MCP prompt 1")
      expect(result).toContain("$1")
      expect(result).toContain("$2")

      expect(result).toContain("## Skills")
      expect(result).toContain("skill1")
      expect(result).toContain("Test skill 1")
      expect(result).toContain("/path/to/skill1")
    })
  })

  describe("空配置场景", () => {
    test("should return empty message when no commands, prompts, or skills are configured", async () => {
      // Mock Config.get
      mock.module("../../../../src/config/config", () => ({
        Config: {
          get: mock(async () => ({
            command: {},
          })),
        },
      }))

      // Mock Skill.all
      mock.module("../../../../src/skill/skill", () => ({
        Skill: {
          all: mock(async () => []),
        },
      }))

      // Mock MCP.prompts
      mock.module("../../../../src/mcp", () => ({
        MCP: {
          prompts: mock(async () => ({})),
        },
      }))

      const result = await list_user_commands.execute({}, {} as any)

      expect(result).toBe(
        "No user-defined commands, MCP prompts, or skills are configured in the project."
      )
    })
  })
})
