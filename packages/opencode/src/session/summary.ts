import { fn } from "@/util/fn"
import z from "zod"
import { Session } from "."

import { MessageV2 } from "./message-v2"
import { Identifier } from "@/id/id"
import { SessionID, MessageID } from "./schema"
import { Snapshot } from "@/snapshot"
import { diffLines } from "diff"

import path from "path"
import { Instance } from "@/project/instance"
import { Storage } from "@/storage/storage"
import { Bus } from "@/bus"

export namespace SessionSummary {

  function normalizeFile(input: string) {
    const unquoted = unquoteGitPath(input).replaceAll("\\", "/")
    if (path.isAbsolute(unquoted)) {
      return path.relative(Instance.worktree, unquoted).replaceAll("\\", "/")
    }
    return unquoted
  }

  function unquoteGitPath(input: string) {
    if (!input.startsWith('"')) return input
    if (!input.endsWith('"')) return input
    const body = input.slice(1, -1)
    const bytes: number[] = []

    for (let i = 0; i < body.length; i++) {
      const char = body[i]!
      if (char !== "\\") {
        bytes.push(char.charCodeAt(0))
        continue
      }

      const next = body[i + 1]
      if (!next) {
        bytes.push("\\".charCodeAt(0))
        continue
      }

      if (next >= "0" && next <= "7") {
        const chunk = body.slice(i + 1, i + 4)
        const match = chunk.match(/^[0-7]{1,3}/)
        if (!match) {
          bytes.push(next.charCodeAt(0))
          i++
          continue
        }
        bytes.push(parseInt(match[0], 8))
        i += match[0].length
        continue
      }

      const escaped =
        next === "n"
          ? "\n"
          : next === "r"
            ? "\r"
            : next === "t"
              ? "\t"
              : next === "b"
                ? "\b"
                : next === "f"
                  ? "\f"
                  : next === "v"
                    ? "\v"
                    : next === "\\" || next === '"'
                      ? next
                      : undefined

      bytes.push((escaped ?? next).charCodeAt(0))
      i++
    }

    return Buffer.from(bytes).toString()
  }

  export const summarize = fn(
    z.object({
      sessionID: SessionID.zod,
      messageID: MessageID.zod,
    }),
    async (input) => {
      const all = await Session.messages({ sessionID: input.sessionID })
      await Promise.all([
        summarizeSession({ sessionID: input.sessionID, messages: all }),
        // summarizeMessage({ messageID: input.messageID, messages: all }),
      ])
    },
  )

  async function summarizeSession(input: { sessionID: SessionID; messages: MessageV2.WithParts[] }) {
    const diffs = await computeDiff({ messages: input.messages })
    await Session.setSummary({
      sessionID: input.sessionID,
      summary: {
        additions: diffs.reduce((sum, x) => sum + x.additions, 0),
        deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
        files: diffs.length,
      },
    })
    await Storage.write(["session_diff", input.sessionID], diffs)
    Bus.publish(Session.Event.Diff, {
      sessionID: input.sessionID,
      diff: diffs,
    })
  }

  function computeToolDiff(messages: MessageV2.WithParts[]) {
    const state = new Map<string, { file: string; before: string; after: string }>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type !== "tool") continue
        if (part.state.status !== "completed") continue
        const metadata = part.state.metadata as Record<string, unknown> | undefined
        const item = metadata?.filediff as Record<string, unknown> | undefined
        if (!item) continue
        const fileRaw = typeof item.file === "string" ? item.file : ""
        const file = normalizeFile(fileRaw)
        if (!file) continue
        const before = typeof item.before === "string" ? item.before : ""
        const after = typeof item.after === "string" ? item.after : ""
        const prev = state.get(file)
        if (!prev) {
          state.set(file, { file, before, after })
          continue
        }
        state.set(file, { file, before: prev.before, after })
      }
    }
    return Array.from(state.values()).map((item) => {
      const counts = diffLines(item.before, item.after).reduce(
        (agg, part) => ({
          additions: agg.additions + (part.added ? (part.count ?? 0) : 0),
          deletions: agg.deletions + (part.removed ? (part.count ?? 0) : 0),
        }),
        { additions: 0, deletions: 0 },
      )
      return {
        file: item.file,
        before: item.before,
        after: item.after,
        additions: counts.additions,
        deletions: counts.deletions,
      }
    })
  }

  async function summarizeMessage(input: { messageID: string; messages: MessageV2.WithParts[] }) {
    const messages = input.messages.filter(
      (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
    )
    const msgWithParts = messages.find((m) => m.info.id === input.messageID)!
    const userMsg = msgWithParts.info as MessageV2.User
    const diffs = await computeDiff({ messages })
    userMsg.summary = {
      ...userMsg.summary,
      diffs,
    }
    await Session.updateMessage(userMsg)
  }

  export const diff = fn(
    z.object({
      sessionID: SessionID.zod,
      messageID: MessageID.zod.optional(),
    }),
    async (input) => {
      const diffs = await Storage.read<Snapshot.FileDiff[]>(["session_diff", input.sessionID]).catch(() => [])
      const next = diffs.map((item) => {
        const file = normalizeFile(item.file)
        if (file === item.file) return item
        return {
          ...item,
          file,
        }
      })
      const changed = next.some((item, i) => item.file !== diffs[i]?.file)
      if (changed) Storage.write(["session_diff", input.sessionID], next).catch(() => {})
      return next
    },
  )

  export async function computeDiff(input: { messages: MessageV2.WithParts[] }) {
    let from: string | undefined
    let to: string | undefined

    // scan assistant messages to find earliest from and latest to
    // snapshot
    for (const item of input.messages) {
      if (!from) {
        for (const part of item.parts) {
          if (part.type === "step-start" && part.snapshot) {
            from = part.snapshot
            break
          }
        }
      }

      for (const part of item.parts) {
        if (part.type === "step-finish" && part.snapshot) {
          to = part.snapshot
        }
      }
    }

    if (from && to) return Snapshot.diffFull(from, to)
    return []
  }
}
