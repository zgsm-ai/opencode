import { createResource, createSignal, Show, For } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { itemApi, artifactApi, type CapabilityItem } from "../lib/api"

const TYPE_META: Record<string, { color: string; back: string; label: string }> = {
  skill: { color: "text-yellow-500", back: "/store/skills", label: "Skills" },
  subagent: { color: "text-blue-500", back: "/store/subagents", label: "Subagents" },
  command: { color: "text-green-500", back: "/store/commands", label: "Commands" },
  mcp: { color: "text-purple-500", back: "/store/mcp-servers", label: "MCP Servers" },
}

const TYPE_SYMBOL: Record<string, string> = {
  skill: "✦",
  subagent: "⬡",
  command: ">_",
  mcp: "⬢",
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function installCmd(item: CapabilityItem) {
  const owner =
    item.registry?.orgId && item.registry.orgId !== "public" ? item.registry.orgId : item.createdBy || "public"
  return `npx costrict install ${owner}/${item.slug}`
}

function renderMd(content: string) {
  return content.split("\n").map((line) => {
    if (line.startsWith("# ")) return <h1 class="text-2xl font-semibold mt-6 mb-3 text-text-strong">{line.slice(2)}</h1>
    if (line.startsWith("## ")) return <h2 class="text-xl font-medium mt-5 mb-2 text-text-strong">{line.slice(3)}</h2>
    if (line.startsWith("### "))
      return <h3 class="text-base font-medium mt-4 mb-2 text-text-strong">{line.slice(4)}</h3>
    if (line.startsWith("- ")) return <li class="ml-5 list-disc mb-1 text-text-weak">{line.slice(2)}</li>
    if (/^\d+\. /.test(line))
      return <li class="ml-5 list-decimal mb-1 text-text-weak">{line.replace(/^\d+\. /, "")}</li>
    if (line.startsWith("```")) return <div class="font-mono text-xs bg-bg-muted px-3 py-1 rounded my-1">{line}</div>
    if (line.trim()) return <p class="mb-2 leading-relaxed text-text-weak">{line}</p>
    return <br />
  })
}

export default function ItemDetail() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [item] = createResource(
    () => params.id,
    (id) => itemApi.get(id),
  )
  const [artifacts] = createResource(
    () => params.id,
    (id) => artifactApi.list(id).then((r) => r.artifacts),
  )
  const [copied, setCopied] = createSignal(false)

  const meta = () => TYPE_META[item()?.itemType ?? "skill"] ?? TYPE_META.skill
  const symbol = () => TYPE_SYMBOL[item()?.itemType ?? "skill"] ?? "•"

  const copy = async () => {
    if (!item()) return
    await navigator.clipboard.writeText(installCmd(item()!))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Show when={!item.loading} fallback={<div class="flex justify-center py-16 text-text-weak">Loading...</div>}>
      <Show
        when={item()}
        fallback={
          <div class="flex flex-col items-center justify-center py-16 gap-4">
            <p class="text-text-weak">Item not found</p>
            <button onClick={() => navigate(-1)} class="text-sm text-text-weak hover:text-text-strong">
              ← Back
            </button>
          </div>
        }
      >
        {(data) => (
          <div class="px-8 py-10 w-full max-w-4xl mx-auto">
            <button
              onClick={() => navigate(meta().back)}
              class="inline-flex items-center gap-2 text-sm text-text-weak hover:text-text-strong transition-colors mb-8"
            >
              ← Back to {meta().label}
            </button>

            <div class="mb-8">
              <div class="flex items-start justify-between gap-4 mb-4">
                <div class="flex items-center gap-3">
                  <span class={`text-2xl ${meta().color}`}>{symbol()}</span>
                  <h1 class="text-2xl font-semibold text-text-strong">{data().name}</h1>
                </div>
                <button
                  onClick={copy}
                  class="p-2 rounded text-text-weak hover:text-text-strong hover:bg-bg-muted transition-colors"
                  title="Copy install command"
                >
                  {copied() ? "✓" : "⎘"}
                </button>
              </div>
              <div class="flex flex-wrap items-center gap-2 mb-4">
                <span class="px-2 py-0.5 text-xs rounded bg-bg-muted text-text-weak">{meta().label.slice(0, -1)}</span>
                <Show when={data().version}>
                  <span class="px-2 py-0.5 text-xs rounded border border-border-weak-base text-text-weak">
                    v{data().version}
                  </span>
                </Show>
                <Show when={data().category}>
                  <span class="px-2 py-0.5 text-xs rounded border border-border-weak-base text-text-weak">
                    #{data().category}
                  </span>
                </Show>
              </div>
              <Show when={data().description}>
                <p class="text-text-weak">{data().description}</p>
              </Show>
            </div>

            {/* Install command */}
            <div class="mb-10 p-4 bg-bg-muted rounded-lg border border-border-weak-base flex items-center justify-between gap-3">
              <div>
                <p class="text-xs text-text-weak mb-1 font-medium">Quick Install</p>
                <code class="text-sm font-mono text-text-strong">{installCmd(data())}</code>
              </div>
              <button
                onClick={copy}
                class="p-2 rounded text-text-weak hover:text-text-strong hover:bg-bg-base transition-colors shrink-0"
              >
                {copied() ? "✓" : "⎘"}
              </button>
            </div>

            <div class="space-y-10">
              <Show when={data().content}>
                <section>
                  <h2 class="text-sm font-semibold text-text-weak uppercase tracking-wide mb-4">Content</h2>
                  <div class="bg-bg-muted rounded-xl p-6 border border-border-weak-base text-sm leading-relaxed">
                    {renderMd(data().content)}
                  </div>
                </section>
              </Show>

              <Show when={(artifacts() ?? []).length > 0}>
                <section>
                  <h2 class="text-sm font-semibold text-text-weak uppercase tracking-wide mb-4">Artifacts</h2>
                  <div class="space-y-3">
                    <For each={artifacts() ?? []}>
                      {(artifact) => (
                        <div class="flex items-center justify-between gap-4 p-4 rounded-xl border border-border-weak-base bg-bg-muted">
                          <div class="min-w-0">
                            <div class="font-medium truncate text-text-strong">{artifact.filename}</div>
                            <div class="text-sm text-text-weak">
                              v{artifact.version} · {formatBytes(artifact.fileSize)} · {artifact.downloadCount}{" "}
                              downloads
                              <Show when={artifact.isLatest}>
                                <span class="ml-2 px-1.5 py-0.5 text-xs bg-bg-base rounded">latest</span>
                              </Show>
                            </div>
                          </div>
                          <a
                            href={artifactApi.downloadUrl(artifact.id)}
                            download=""
                            class="px-3 py-1.5 text-sm bg-bg-base border border-border-weak-base rounded text-text-strong hover:bg-bg-muted transition-colors"
                          >
                            ↓ Download
                          </a>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <section>
                <h2 class="text-sm font-semibold text-text-weak uppercase tracking-wide mb-4">Details</h2>
                <div class="bg-bg-muted rounded-xl border border-border-weak-base overflow-hidden">
                  <dl class="divide-y divide-border-weak-base">
                    <div class="flex items-center justify-between px-5 py-3.5">
                      <dt class="text-text-weak">Type</dt>
                      <dd class="font-medium text-text-strong">{meta().label.slice(0, -1)}</dd>
                    </div>
                    <div class="flex items-center justify-between px-5 py-3.5">
                      <dt class="text-text-weak">Visibility</dt>
                      <dd class="capitalize text-text-strong">{data().visibility}</dd>
                    </div>
                    <Show when={data().createdBy}>
                      <div class="flex items-center justify-between px-5 py-3.5">
                        <dt class="text-text-weak">Author</dt>
                        <dd class="font-medium text-text-strong">{data().createdBy}</dd>
                      </div>
                    </Show>
                    <div class="flex items-center justify-between px-5 py-3.5">
                      <dt class="text-text-weak">Created</dt>
                      <dd class="text-text-strong">{formatDate(data().createdAt)}</dd>
                    </div>
                    <div class="flex items-center justify-between px-5 py-3.5">
                      <dt class="text-text-weak">Updated</dt>
                      <dd class="text-text-strong">{formatDate(data().updatedAt)}</dd>
                    </div>
                  </dl>
                </div>
              </section>
            </div>
          </div>
        )}
      </Show>
    </Show>
  )
}
