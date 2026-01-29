export const RUN_AND_FIX_AGENT_NAME = "RunAndFix" as const
export const TEST_DESIGN_AGENT_NAME = "TestDesign" as const
export const TEST_AND_FIX_AGENT_NAME = "TestAndFix" as const
export const TEST_PREPARE_AGENT_NAME = "TestPrepare" as const

export type AgentName =
  | typeof RUN_AND_FIX_AGENT_NAME
  | typeof TEST_DESIGN_AGENT_NAME
  | typeof TEST_AND_FIX_AGENT_NAME
  | typeof TEST_PREPARE_AGENT_NAME
