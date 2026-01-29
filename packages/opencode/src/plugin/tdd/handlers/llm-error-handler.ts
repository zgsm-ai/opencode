import { ErrorLog } from "../utils/error-log"
import { Log } from "@/util/log"

const log = Log.create({ service: "tdd.plugin.llm-error" })

/**
 * Handle LLM error events from the session and log them with full stack traces
 */
export async function handleLLMError(input: { event: any }): Promise<void> {
  if (input.event.type !== "session.llm.error") {
    return
  }

  const { providerID, modelID, sessionID, agent, requestType, attempt, error, request } = input.event.properties

  log.info("LLM error detected", {
    providerID,
    modelID,
    sessionID,
    agent,
    requestType,
    attempt,
    error,
  })

  await ErrorLog.logLLMError(error, {
    providerID,
    modelID,
    sessionID,
    agent,
    requestType,
    attempt,
    request,
  })
}
