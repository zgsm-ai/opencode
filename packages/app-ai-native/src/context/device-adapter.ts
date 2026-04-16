import { createContext, useContext } from "solid-js"
import type { DeviceClient } from "../client/device-client"

export type ConversationAdapter = {
  sessionCreate: () => Promise<{ data: unknown }>
  sessionAbort: (sessionID: string) => Promise<{ data: unknown }>
  sessionPromptAsync: (input: { sessionID: string } & Record<string, unknown>) => Promise<{ data: unknown }>
  sessionShell: (input: { sessionID: string } & Record<string, unknown>) => Promise<{ data: unknown }>
  sessionCommand: (input: { sessionID: string } & Record<string, unknown>) => Promise<{ data: unknown }>
  sessionGet: (sessionID: string) => Promise<{ data: unknown }>
  sessionUpdate: (input: { sessionID: string } & Record<string, unknown>) => Promise<{ data: unknown }>
  sessionDelete: (sessionID: string) => Promise<{ data: unknown }>
  sessionMessages: (sessionID: string, directory: string, limit: number) => Promise<{ data: unknown }>
  sessionDiff: (sessionID: string) => Promise<{ data: unknown }>
  sessionTodo: (sessionID: string) => Promise<{ data: unknown }>
  sessionList: (directory?: string) => Promise<{ data: unknown }>
  sessionStatus: () => Promise<{ data: unknown }>
  health: () => Promise<{ data: unknown }>
  path: () => Promise<{ data: unknown }>
  sessionModes: () => Promise<{ data: unknown }>
  agentRuntimes: () => Promise<{ data: unknown }>
  worktreeCreate: (directory: string) => Promise<unknown>
  commands: () => Promise<{ data: unknown }>
  vcs: (directory: string) => Promise<{ data: unknown }>
  permissions: () => Promise<{ data: unknown }>
  questions: () => Promise<{ data: unknown }>
  questionReply: (requestID: string, answers: unknown) => Promise<{ data: unknown }>
  questionReject: (requestID: string) => Promise<{ data: unknown }>
}

const ConversationAdapterContext = createContext<ConversationAdapter>()

export function useConversationAdapter() {
  const ctx = useContext(ConversationAdapterContext)
  if (!ctx) throw new Error("useConversationAdapter must be used within a ConversationAdapterContext.Provider")
  return ctx
}

export { ConversationAdapterContext }

export function deviceAdapter(client: DeviceClient): ConversationAdapter {
  const wrap = <T>(p: Promise<T>) => p.then((data) => ({ data })) as Promise<{ data: unknown }>

  return {
    health: () => wrap(client.runtime.health()),
    path: () => wrap(client.runtime.path()),
    sessionModes: () => wrap(client.agent.sessionModes()),
    agentRuntimes: () => wrap(client.agent.list()),
    sessionGet: (id) => wrap(client.conversation.get(id)),
    sessionList: (directory) => wrap(client.conversation.list(directory ? { directory } : undefined)),
    sessionMessages: (id, _directory, limit) => wrap(client.conversation.messages(id, { limit })),
    sessionStatus: () => wrap(client.conversation.status()),
    sessionDiff: (id) => wrap(client.conversation.diff(id)),
    sessionTodo: (id) => wrap(client.conversation.todo(id)),
    sessionCreate: () => wrap(client.conversation.create()),
    sessionUpdate: (input) => wrap(client.conversation.update(input.sessionID, input)),
    sessionDelete: (id) => wrap(client.conversation.delete(id)),
    sessionAbort: (id) => wrap(client.conversation.abort(id)),
    sessionShell: (input) => wrap(client.conversation.shell(input.sessionID, input)),
    sessionCommand: (input) => wrap(client.conversation.command(input.sessionID, input)),
    sessionPromptAsync: (input) => wrap(client.conversation.promptAsync(input.sessionID, input)),
    worktreeCreate: () => Promise.resolve(undefined),
    commands: () => wrap(client.agent.commands()),
    vcs: () => wrap(client.runtime.vcs()),
    permissions: () => wrap(client.permission.list()),
    questions: () => wrap(client.question.list()),
    questionReply: (id, answers) => wrap(client.question.reply(id, { answers })),
    questionReject: (id) => wrap(client.question.reject(id)),
  }
}

export function sdkAdapter(sdk: any): ConversationAdapter {
  const wrap = <T>(p: Promise<T>) => p.then((data: unknown) => ({ data })) as Promise<{ data: unknown }>

  return {
    health: () => wrap(sdk.runtime.health()),
    path: () => wrap(sdk.runtime.path()),
    sessionModes: () => wrap(sdk.agent.sessionModes()),
    agentRuntimes: () => wrap(sdk.agent.list()),
    sessionGet: (sessionID: string) => wrap(sdk.conversation.get(sessionID)),
    sessionList: (directory?: string) => wrap(sdk.conversation.list(directory ? { directory } : undefined)),
    sessionMessages: (sessionID: string, directory: string, limit: number) =>
      wrap(sdk.conversation.messages(sessionID, { directory, limit })),
    sessionStatus: () => wrap(sdk.conversation.status()),
    sessionDiff: (sessionID: string) => wrap(sdk.conversation.diff(sessionID)),
    sessionTodo: (sessionID: string) => wrap(sdk.conversation.todo(sessionID)),
    sessionCreate: () => wrap(sdk.conversation.create()),
    sessionUpdate: (input: { sessionID: string } & Record<string, unknown>) =>
      wrap(sdk.conversation.update(input.sessionID, input)),
    sessionDelete: (sessionID: string) => wrap(sdk.conversation.delete(sessionID)),
    sessionAbort: (sessionID: string) => wrap(sdk.conversation.abort(sessionID)),
    sessionShell: (input: { sessionID: string } & Record<string, unknown>) =>
      wrap(sdk.conversation.shell(input.sessionID, input)),
    sessionCommand: (input: { sessionID: string } & Record<string, unknown>) =>
      wrap(sdk.conversation.command(input.sessionID, input)),
    sessionPromptAsync: (input: { sessionID: string } & Record<string, unknown>) =>
      wrap(sdk.conversation.promptAsync(input.sessionID, input)),
    worktreeCreate: (directory: string) => sdk.raw.worktree.create({ directory }),
    commands: () => wrap(sdk.runtime.commands()),
    vcs: (directory: string) => wrap(sdk.runtime.vcs(directory)),
    permissions: () => wrap(sdk.permission.list()),
    questions: () => wrap(sdk.question.list()),
    questionReply: (requestID: string, answers: unknown) =>
      wrap(sdk.question.reply(requestID, { answers })),
    questionReject: (requestID: string) => wrap(sdk.question.reject(requestID)),
  }
}
