import { createContext, useContext, createSignal, type JSX } from "solid-js"
import type { Organization } from "../lib/api"

interface OrgFilterContextValue {
  selectedOrg: () => Organization | null
  setSelectedOrg: (org: Organization | null) => void
}

const OrgFilterContext = createContext<OrgFilterContextValue>({
  selectedOrg: () => null,
  setSelectedOrg: () => {},
})

export function OrgFilterProvider(props: { children: JSX.Element }) {
  const [org, setOrg] = createSignal<Organization | null>(null)
  return (
    <OrgFilterContext.Provider value={{ selectedOrg: org, setSelectedOrg: setOrg }}>
      {props.children}
    </OrgFilterContext.Provider>
  )
}

export function useOrgFilter() {
  return useContext(OrgFilterContext)
}
