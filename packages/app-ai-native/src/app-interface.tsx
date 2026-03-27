import { type JSX } from "solid-js"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { AppShellProviders } from "@/app"

export function AppInterface(props: { children?: JSX.Element }) {
  return (
    <GlobalSDKProvider>
      <GlobalSyncProvider>
        <AppShellProviders>
          {props.children}
        </AppShellProviders>
      </GlobalSyncProvider>
    </GlobalSDKProvider>
  )
}
