import { type Component, For, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useCloudTeam } from "@/context/cloud-team"
import { cloudTeamApi } from "@/client/cloud-team-api"
import { showToast } from "@opencode-ai/ui/toast"
import type { TeamSession } from "@/client/cloud-team-types"

/**
 * Session browse/join/create UI.
 *
 * Shows available sessions (fetched from the server) and lets
 * the user join one or create a new session. Displayed when no
 * active session exists.
 */
export const CloudTeamSessionBrowser: Component = () => {
  const cloudTeam = useCloudTeam()

  const [sessions, setSessions] = createSignal<TeamSession[]>([])
  const [loading, setLoading] = createSignal(false)
  const [joining, setJoining] = createSignal<string | null>(null)
  const [error, setError] = createSignal("")
  const [showBrowser, setShowBrowser] = createSignal(false)
  const [showCreate, setShowCreate] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
  const [newName, setNewName] = createSignal("")
  const [newRepoUrl, setNewRepoUrl] = createSignal("")

  const fetchSessions = async () => {
    setLoading(true)
    setError("")
    try {
      const list = await cloudTeamApi.session.list()
      setSessions(list)
      setShowBrowser(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions")
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async (sessionId: string) => {
    setJoining(sessionId)
    setError("")
    try {
      await cloudTeam.joinSession(sessionId)
      setShowBrowser(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session")
    } finally {
      setJoining(null)
    }
  }

  const handleCreate = async () => {
    const name = newName().trim()
    if (!name) return
    setCreating(true)
    setError("")
    try {
      await cloudTeam.createSession(name, newRepoUrl().trim() || undefined)
      showToast({ title: "Session created", description: name })
      setShowCreate(false)
      setNewName("")
      setNewRepoUrl("")
    } catch (err) {
      showToast({ title: "Failed to create session", description: err instanceof Error ? err.message : "Unknown error" })
      setError(err instanceof Error ? err.message : "Failed to create session")
    } finally {
      setCreating(false)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-600"
      case "paused":
        return "text-amber-600"
      case "completed":
        return "text-blue-600"
      case "failed":
        return "text-red-600"
      default:
        return "text-text-weak"
    }
  }

  return (
    <div class="px-3 py-2 space-y-2">
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="small"
          class="text-11-regular"
          disabled={loading()}
          onClick={fetchSessions}
        >
          {loading() ? "Loading..." : "Browse Sessions"}
        </Button>
        <Show when={loading()}>
          <Spinner class="size-3.5" />
        </Show>
        <div class="flex-1" />
        <Button
          variant="ghost"
          size="small"
          class="text-11-regular"
          onClick={() => setShowCreate(!showCreate())}
        >
          {showCreate() ? "Cancel" : "New Session"}
        </Button>
      </div>

      {/* Create session form */}
      <Show when={showCreate()}>
        <div class="space-y-1.5 rounded-md border border-border-weak-base p-2 bg-background-stronger">
          <input
            type="text"
            class="w-full rounded border border-border-weak-base bg-background-base px-2 py-1 text-12-regular text-text-base outline-none focus:border-blue-500"
            placeholder="Session name"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
          />
          <input
            type="text"
            class="w-full rounded border border-border-weak-base bg-background-base px-2 py-1 text-12-regular text-text-base outline-none focus:border-blue-500"
            placeholder="Repository URL (optional)"
            value={newRepoUrl()}
            onInput={(e) => setNewRepoUrl(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
          />
          <Button
            variant="primary"
            size="small"
            class="text-11-regular w-full"
            disabled={!newName().trim() || creating()}
            onClick={handleCreate}
          >
            {creating() ? "Creating..." : "Create Session"}
          </Button>
        </div>
      </Show>

      <Show when={error()}>
        <div class="text-11-regular text-red-500">{error()}</div>
      </Show>

      <Show when={showBrowser() && sessions().length > 0}>
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <For each={sessions()}>
            {(session) => (
              <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-background-stronger transition-colors">
                <div class="flex-1 min-w-0">
                  <div class="text-12-regular text-text-base truncate">{session.name}</div>
                  <div class="text-10-regular text-text-weak">
                    <span class={statusColor(session.status)}>{session.status}</span>
                    {" · "}
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="small"
                  class="text-11-regular shrink-0"
                  disabled={joining() !== null || session.status === "completed" || session.status === "failed"}
                  onClick={() => handleJoin(session.id)}
                >
                  {joining() === session.id ? "Joining..." : "Join"}
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={showBrowser() && sessions().length === 0 && !loading()}>
        <div class="flex flex-col items-center gap-1.5 py-3 text-center">
          <Icon name="cloud-upload" class="size-5 text-text-weaker" />
          <div class="text-11-regular text-text-weak">No active sessions found</div>
          <div class="text-10-regular text-text-weaker">Create a new session or wait for one to appear</div>
        </div>
      </Show>
    </div>
  )
}
