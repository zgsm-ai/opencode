import { type ParentProps } from "solid-js"
import { ServerConnection, ServerProvider } from "@/context/server"
import { CloudTeamProvider } from "@/context/cloud-team"
import { CloudTeamHomePage } from "./home"
import { env } from "@/lib/env"

export function CloudTeamLayout(props: ParentProps) {
  // Cloud team needs ServerProvider (for server.isLocal() check inside CloudTeamProvider).
  // Use the cloud API URL as the server — it's always remote (not local).
  const apiBase = env.API_URL || env.API_PREFIX || window.location.origin
  return (
    <ServerProvider defaultServer={ServerConnection.Key.make(apiBase)}>
      <CloudTeamProvider>
        <div class="size-full overflow-hidden">
          {props.children}
        </div>
      </CloudTeamProvider>
    </ServerProvider>
  )
}

export { CloudTeamHomePage }
