import type { Config } from "../../../config/config"
import type { AgentPromptMetadata } from "../types"
import PROMPT from "./prompts/test_and_fix.txt"
import { TEST_AND_FIX_AGENT_NAME, type AgentName } from "./constants"

export const TEST_AND_FIX_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "FREE",
  triggers: [
    {
      domain: "Testing",
      trigger: "Execute tests and automatically diagnose and fix failures",
    },
  ],
  useWhen: ["Running tests and need to fix failures", "Executing test suites", "Verifying code quality"],
  avoidWhen: ["Designing test cases", "Writing new features", "Code review"],
}

export async function createTestAndFixAgent(_: string): Promise<Config.Agent & { name: AgentName }> {
  const testGuideResult = await import("../utils/test-guide-discovery").then((m) => m.TestGuide.load())
  const testGuideSuffix = testGuideResult.content ? `\n\n# Test Guide\n\n${testGuideResult.content}` : ""

  return {
    name: TEST_AND_FIX_AGENT_NAME,
    description:
      "Specialized agent for executing tests and automatically diagnosing and fixing test failures. Analyzes test output, locates issues, applies fixes, and validates results.",
    mode: "subagent",
    // model,
    temperature: 0.1,
    prompt: PROMPT + testGuideSuffix,
    permission: {
      question: "allow",
      todowrite: "allow",
      todoread: "allow"
    }
  }
}
