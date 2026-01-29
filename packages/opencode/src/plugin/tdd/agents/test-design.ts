import type { Config } from "../../../config/config"
import type { AgentPromptMetadata } from "../types"
import PROMPT from "./prompts/test_design.txt"
import { TEST_DESIGN_AGENT_NAME, type AgentName } from "./constants"

export const TEST_DESIGN_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "FREE",
  triggers: [
    {
      domain: "Testing",
      trigger: "Design test points and generate test case documents",
    },
  ],
  useWhen: [
    "Need to design comprehensive test cases",
    "Planning test strategy for new features",
    "Creating test plan documents",
  ],
  avoidWhen: ["Executing tests", "Fixing specific bugs", "Writing implementation code"],
}

export async function createTestDesignAgent(_: string): Promise<Config.Agent & { name: AgentName }> {
  const testGuideResult = await import("../utils/test-guide-discovery").then((m) => m.TestGuide.load())
  const testGuideSuffix = testGuideResult.content ? `\n\n# Test Guide\n\n${testGuideResult.content}` : ""

  return {
    name: TEST_DESIGN_AGENT_NAME,
    description:
      "Specialized agent for test point design and test case planning. Designs comprehensive test points based on functional requirements or code, and generates structured test plan documents in Markdown format.",
    mode: "subagent",
    // model,
    temperature: 0.1,
    prompt: PROMPT + testGuideSuffix,
    permission: {
      question: "allow",
      todowrite: "allow",
      todoread: "allow",
      bash: "deny"
    }
  }
}
