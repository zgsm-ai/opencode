import { createContext, useContext, type Accessor } from "solid-js"

const DirectoryContext = createContext<Accessor<string>>()

export function useDirectory() {
  const ctx = useContext(DirectoryContext)
  if (!ctx) throw new Error("useDirectory must be used within DirectoryProvider")
  return ctx
}

export { DirectoryContext }
