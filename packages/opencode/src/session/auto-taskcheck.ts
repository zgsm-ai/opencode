import { Bus } from "@/bus"
import { SessionStatus } from "./status"
import { Session } from "."
import { MessageV2 } from "./message-v2"
import { Log } from "@/util/log"
import { SessionPrompt } from "./prompt"

const log = Log.create({ service: "auto-taskcheck" })

export namespace AutoTaskCheck {
  let initialized = false

  export function init() {
    if (initialized) return
    initialized = true

    // Listen for session idle events
    Bus.subscribe(SessionStatus.Event.Idle, async (event) => {
      await handleSessionIdle(event.properties.sessionID)
    })

    log.info("AutoTaskCheck initialized")
  }

  async function handleSessionIdle(sessionID: string) {
    try {
      // 1. Get session info
      const session = await Session.get(sessionID)
      if (!session) {
        log.debug("Session not found", { sessionID })
        return
      }

      // 2. Get all messages from the session
      const messages = await Session.messages({ sessionID })
      if (!messages || messages.length === 0) {
        log.debug("No messages in session", { sessionID })
        return
      }

      // 3. Find the last assistant message
      const assistantMessages = messages.filter((m: MessageV2.WithParts) => m.info.role === "assistant")
      const lastAssistant = assistantMessages[assistantMessages.length - 1]

      if (!lastAssistant || lastAssistant.info.role !== "assistant") {
        log.debug("No assistant messages found", { sessionID })
        return
      }

      // 4. Check if it's proposal agent
      if (lastAssistant.info.agent !== "proposal") {
        log.debug("Not a proposal agent session", { sessionID, agent: lastAssistant.info.agent })
        return
      }

      // 5. Check if it finished successfully (not error)
      if (!lastAssistant.info.finish || lastAssistant.info.finish === "error") {
        log.debug("Proposal agent did not finish successfully", {
          sessionID,
          finish: lastAssistant.info.finish
        })
        return
      }

      // 6. Get all parts from the last assistant message
      const parts = await MessageV2.parts(lastAssistant.info.id)
      if (!parts || parts.length === 0) {
        log.debug("No parts in last assistant message", { sessionID })
        return
      }

      // 7. Find the task_done_with_change_id tool call
      const taskDonePart = parts
        .filter(p =>
          p.type === "tool" &&
          p.tool === "task_done_with_change_id" &&
          p.state.status === "completed"
        )
        .pop()

      if (!taskDonePart || taskDonePart.type !== "tool") {
        log.debug("No task_done_with_change_id tool call found", { sessionID })
        return
      }

      // 8. Extract change_id from tool metadata
      const changeID = taskDonePart.state.status === "completed"
        ? taskDonePart.state.metadata?.changeID
        : undefined

      if (!changeID || typeof changeID !== "string") {
        log.warn("ProposalAgent completed but no change_id found in metadata", {
          sessionID,
          metadata: taskDonePart.state.status === "completed" ? taskDonePart.state.metadata : undefined
        })
        return
      }

      log.info("Auto-starting TaskCheckAgent", { sessionID, changeID })

      // 9. Create new TaskCheckAgent session
      const newSession = await Session.create({
        title: `TaskCheck: ${changeID}`,
        parentID: sessionID,
      })

      // 10. Start TaskCheckAgent with change_id
      await SessionPrompt.prompt({
        sessionID: newSession.id,
        agent: "taskcheck",
        parts: [
          {
            type: "text",
            text: `Check and improve tasks for change_id: ${changeID}`,
          }
        ],
      })

      log.info("TaskCheckAgent started successfully", {
        parentSessionID: sessionID,
        taskcheckSessionID: newSession.id,
        changeID
      })

    } catch (error) {
      log.error("Failed to auto-start TaskCheckAgent", { sessionID, error })
    }
  }
}
