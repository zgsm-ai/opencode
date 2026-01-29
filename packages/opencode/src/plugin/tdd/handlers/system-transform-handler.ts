import { RUN_AND_FIX_AGENT_NAME } from "../agents"
import type { Hooks } from "@opencode-ai/plugin"

export async function handleSystemTransform(
  context: Parameters<Exclude<Hooks["experimental.chat.system.transform"], undefined>>[0],
  output: { system: string[] },
): Promise<void> {
  output.system.push(`# TDD Guidance

After completing a significant amount of feature code (e.g., finishing a task, implementing multiple functions/classes), you should perform runnability verification:

1. Use the "${RUN_AND_FIX_AGENT_NAME}" subagent to verify the project:
   - The agent will automatically find and execute verification commands (compile, build, test)
   - It will fix any coding issues encountered (syntax errors, type errors, logic bugs)
   - For non-coding issues (missing dependencies, environment problems), it will report them and exit
2. If verification passes, continue with remaining feature development
3. If the agent reports non-coding issues that need manual intervention, resolve them and run verification again

The "${RUN_AND_FIX_AGENT_NAME}" agent is available as a subagent for automatic verification and fixing of coding issues.`)
}
