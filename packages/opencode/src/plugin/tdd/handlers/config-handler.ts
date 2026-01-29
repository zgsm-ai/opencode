import {
  createRunAndFixAgent,
  createTestDesignAgent,
  createTestAndFixAgent,
  createTestPrepareAgent,
  RUN_AND_FIX_AGENT_NAME,
  TEST_DESIGN_AGENT_NAME,
  TEST_AND_FIX_AGENT_NAME,
  TEST_PREPARE_AGENT_NAME,
} from "../agents"

export async function handleConfig(config: any): Promise<void> {
  const systemDefaultModel = (config.model as string | undefined) || "claude-sonnet-4-5"

  if (!config.agent) {
    config.agent = {}
  }

  config.agent[RUN_AND_FIX_AGENT_NAME] = await createRunAndFixAgent(systemDefaultModel)
  config.agent[TEST_DESIGN_AGENT_NAME] = await createTestDesignAgent(systemDefaultModel)
  config.agent[TEST_AND_FIX_AGENT_NAME] = await createTestAndFixAgent(systemDefaultModel)
  config.agent[TEST_PREPARE_AGENT_NAME] = await createTestPrepareAgent(systemDefaultModel)
}
