export interface AgentPromptMetadata {
  category: "exploration" | "specialist" | "advisor" | "utility"
  cost: "FREE" | "CHEAP" | "EXPENSIVE"
  triggers: Array<{
    domain: string
    trigger: string
  }>
  useWhen: string[]
  avoidWhen: string[]
}
