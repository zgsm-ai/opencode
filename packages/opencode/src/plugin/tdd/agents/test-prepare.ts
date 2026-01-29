import type { Config } from "../../../config/config"
import type { AgentPromptMetadata } from "../types"
import PROMPT from "./prompts/test_prepare.txt"
import { TEST_PREPARE_AGENT_NAME, type AgentName } from "./constants"

export const TEST_PREPARE_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "FREE",
  triggers: [
    {
      domain: "Testing",
      trigger: "Check and prepare TEST_GUIDE.md for completeness",
    },
  ],
  useWhen: [
    "Starting work on a new project",
    "Need to verify project testing configuration",
    "TEST_GUIDE.md may be missing or incomplete",
  ],
  avoidWhen: ["Writing actual test code", "Executing tests", "Implementing features"],
}

export async function createTestPrepareAgent(_: string): Promise<Config.Agent & { name: AgentName }> {
  const testGuideResult = await import("../utils/test-guide-discovery").then((m) => m.TestGuide.load())
  const testGuideContext = testGuideResult.content
    ? `\n\n# Current TEST_GUIDE Content\n\n${testGuideResult.content}`
    : "\n\n# Current TEST_GUIDE Content\n\nNo TEST_GUIDE.md file found in the project."

  return {
    name: TEST_PREPARE_AGENT_NAME,
    description:
      "Specialized agent for checking and filling TEST_GUIDE.md. Ensures TEST_GUIDE.md contains runnability verification commands, test case management methods, and test execution methods. Only locates commands without executing them.",
    mode: "subagent",
    // model,
    temperature: 0.1,
    prompt: PROMPT + testGuideContext,
    permission: {
      question: "allow",
      todowrite: "allow",
      todoread: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      write: "allow",
      task: "deny",
      bash: "deny"
    }
  }
}
