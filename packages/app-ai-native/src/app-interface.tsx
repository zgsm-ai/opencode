import { type JSX } from "solid-js"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { CloudTeamProvider } from "@/context/cloud-team"
import { AppShellProviders } from "@/app"

export function AppInterface(props: { children?: JSX.Element }) {
  return (
    <GlobalSDKProvider>
      <GlobalSyncProvider>
        <CloudTeamProvider>
          <AppShellProviders>
            {props.children}
          </AppShellProviders>
        </CloudTeamProvider>
      </GlobalSyncProvider>
    </GlobalSDKProvider>
  )
}
