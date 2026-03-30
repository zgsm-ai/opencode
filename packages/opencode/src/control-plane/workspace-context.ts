import { Context } from "@/util/context"
import type { WorkspaceID } from "./schema"

export interface WorkspaceContextValue {
  workspaceID?: WorkspaceID
}

const context = Context.create<WorkspaceContextValue>("workspace")

export const WorkspaceContext = {
  provide<R>(input: { workspaceID?: WorkspaceID; fn: () => R }) {
    return context.provide({ workspaceID: input.workspaceID }, input.fn)
  },
  get workspaceID() {
    try {
      return context.use().workspaceID
    } catch {
      return undefined
    }
  },
}
