import { createContext, useContext } from "solid-js"

export type SDKValue = {
  directory: string
  client: any
  url: string
  createClient: (opts: any) => any
  event: any
}

export const SDKContext = createContext<SDKValue>()

export function useSDK() {
  return useContext(SDKContext)
}
