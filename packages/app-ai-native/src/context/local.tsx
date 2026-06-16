import { createContext, useContext } from "solid-js"

export const LocalContext = createContext<any>()

export function useLocal() {
  return useContext(LocalContext)
}
