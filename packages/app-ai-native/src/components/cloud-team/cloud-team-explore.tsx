import { type Component, For, Show, createSignal, createMemo } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useCloudTeam } from "@/context/cloud-team"
import { cloudTeamApi } from "@/client/cloud-team-api"
import type { ExploreQuery, ExploreQueryType } from "@/client/cloud-team-types"

/**
 * Explore UI panel for the Leader to send remote code exploration
 * queries to a selected teammate's machine.
 */
export const CloudTeamExplore: Component = () => {
  const cloudTeam = useCloudTeam()

  const [selectedMachineId, setSelectedMachineId] = createSignal("")
  const [queryType, setQueryType] = createSignal<ExploreQueryType>("file_tree")
  const [queryInput, setQueryInput] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [result, setResult] = createSignal<unknown>(null)
  const [error, setError] = createSignal("")

  const onlineTeammates = createMemo(() =>
    cloudTeam.teammates().filter((t) => t.status === "online" && t.machineId !== cloudTeam.session()?.leaderId),
  )

  const handleExplore = async () => {
    const machineId = selectedMachineId()
    const sessionId = cloudTeam.session()?.id
    if (!machineId || !sessionId) return

    const input = queryInput().trim()
    const qType = queryType()

    const params: Record<string, unknown> = {}
    if (input) {
      if (qType === "content_search") params.pattern = input
      else if (qType === "symbol_search") params.symbol = input
      else if (qType === "git_log") params.maxCount = parseInt(input) || 10
      else if (qType === "dependency_graph") params.entryFile = input
    }

    const queries: ExploreQuery[] = [{ type: qType, params }]

    setLoading(true)
    setError("")
    setResult(null)

    try {
      const res = await cloudTeamApi.explore.submit(sessionId, {
        targetMachineId: machineId,
        queries,
      })
      setResult(res.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explore failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="space-y-2 px-3 py-2">
      <div class="text-11-regular text-text-weak mb-1">Explore Codebase</div>

      {/* Teammate selector */}
      <div class="flex items-center gap-2">
        <select
          value={selectedMachineId()}
          onChange={(e) => setSelectedMachineId(e.currentTarget.value)}
          class="flex-1 min-w-0 text-12-regular bg-transparent border border-border-weak-base rounded px-2 py-1 outline-none focus:border-border-base"
        >
          <option value="">Select teammate...</option>
          <For each={onlineTeammates()}>
            {(t) => <option value={t.machineId}>{t.machineName || t.machineId}</option>}
          </For>
        </select>
      </div>

      {/* Query type + input */}
      <div class="flex items-center gap-2">
        <select
          value={queryType()}
          onChange={(e) => setQueryType(e.currentTarget.value as ExploreQueryType)}
          class="text-12-regular bg-transparent border border-border-weak-base rounded px-2 py-1 outline-none focus:border-border-base"
        >
          <option value="file_tree">File Tree</option>
          <option value="symbol_search">Symbol Search</option>
          <option value="content_search">Content Search</option>
          <option value="git_log">Git Log</option>
          <option value="dependency_graph">Dependency Graph</option>
        </select>
        <input
          type="text"
          value={queryInput()}
          onInput={(e) => setQueryInput(e.currentTarget.value)}
          placeholder={
            queryType() === "content_search"
              ? "search pattern..."
              : queryType() === "symbol_search"
                ? "symbol name..."
                : "optional params..."
          }
          class="flex-1 min-w-0 text-12-regular bg-transparent border border-border-weak-base rounded px-2 py-1 outline-none focus:border-border-base"
        />
      </div>

      {/* Submit */}
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="small"
          class="text-11-regular"
          disabled={!selectedMachineId() || loading()}
          onClick={handleExplore}
        >
          {loading() ? "Exploring..." : "Explore"}
        </Button>
        <Show when={loading()}>
          <Spinner class="size-3.5" />
        </Show>
      </div>

      {/* Result */}
      <Show when={error()}>
        <div class="text-11-regular text-red-500">{error()}</div>
      </Show>
      <Show when={result()}>
        <div class="max-h-48 overflow-y-auto rounded border border-border-weak-base bg-background-stronger p-2">
          <pre class="text-11-regular text-text-base whitespace-pre-wrap break-words">
            {JSON.stringify(result(), null, 2)}
          </pre>
        </div>
      </Show>
    </div>
  )
}
