import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { useWorkspace } from "../context"

export default function WorkspaceHome() {
  const t = useLanguage().t
  const navigate = useNavigate()
  const platform = usePlatform()
  const work = useWorkspace()
  const installUrl = "https://docs.costrict.ai/cli/guide/installation#%E4%BA%8C%E4%B8%80%E9%94%AE%E5%AE%89%E8%A3%85%E6%8E%A8%E8%8D%90"
  const [copiedId, setCopiedId] = createSignal<string | null>(null)
  const steps: { id: string; tone: string; titleKey: string; descKey: string; kind: string; cmdKey?: string }[] = [
    { id: "01", tone: "var(--native-warning)", titleKey: "workspace.home.step1.title", descKey: "workspace.home.step1.description", kind: "link" },
    { id: "02", tone: "var(--native-primary)", titleKey: "workspace.home.step2.title", descKey: "workspace.home.step2.description", kind: "cmd", cmdKey: "workspace.home.step2.cmd" },
    { id: "03", tone: "var(--native-primary)", titleKey: "workspace.home.step3.title", descKey: "workspace.home.step3.description", kind: "cmd", cmdKey: "workspace.home.step3.cmd" },
    { id: "04", tone: "var(--native-success)", titleKey: "workspace.home.step4.title", descKey: "workspace.home.step4.description", kind: "cmd", cmdKey: "workspace.home.step4.cmd" },
    { id: "05", tone: "var(--native-success)", titleKey: "workspace.home.step5.title", descKey: "workspace.home.step5.description", kind: "cta" },
  ]
  const acts = [
    { icon: "store" as const, titleKey: "workspace.home.browseStore", tone: "var(--native-primary)", soft: "var(--native-primary-soft)", trail: "arrow-right" as const, run: () => navigate("/store") },
    { icon: "help" as const, titleKey: "workspace.home.viewDocs", tone: "var(--native-muted)", soft: "var(--native-surface)", trail: "square-arrow-top-right" as const, run: () => platform.openLink("https://docs.costrict.ai") },
  ]
  const run = createMemo(() => {
    const ids = work.enabledWorkspaceIds()
    return work
      .workspaces()
      .find((item) => ids.includes(item.id) && (item.directories?.length ?? 0) > 0)
  })
  const dir = createMemo(() => {
    const item = run()
    if (!item?.directories?.length) return
    return item.directories.find((entry) => entry.isDefault) ?? item.directories[0]
  })

  let timer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    if (!timer) return
    clearTimeout(timer)
  })

  const copy = (text: string, id: string) => {
    const task = navigator.clipboard?.writeText(text)
    if (!task) return
    void task.then(() => {
      setCopiedId(id)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setCopiedId(null), 1600)
    })
  }

  return (
    <div class="thin-scrollbar flex min-h-full min-w-0 flex-col gap-6 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <header class="native-page-header mx-auto w-full max-w-[1080px]">
        <h1 class="m-0 max-w-[28ch] font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{t("workspace.home.title")}</h1>
        <p class="mt-3 max-w-[66ch] text-[0.9375rem] leading-[1.7] text-[var(--native-muted)]">{t("workspace.home.subtitle")}</p>
      </header>

      <div class="mx-auto flex min-h-0 min-w-0 max-w-[1080px] flex-1 flex-col gap-5 w-full">
        <section class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18.5rem,0.9fr)]">
          <div class="rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_86%,var(--native-bg-subtle))] shadow-[var(--native-shadow-sm)] overflow-hidden">
            <For each={steps}>
              {(step, idx) => (
                <div
                  class="flex items-center gap-4 px-5 py-4"
                  classList={{ "border-t border-[color:color-mix(in_oklab,var(--native-border)_22%,transparent)]": idx() > 0 }}
                  style={{ "--step-tone": step.tone }}
                >
                  <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--step-tone)_10%,transparent)] font-[var(--native-font-mono)] text-[0.8125rem] font-semibold text-[var(--step-tone)]">
                    {step.id}
                  </span>

                  <div class="flex-1 min-w-0">
                    <h2 class="m-0 text-[0.9375rem] font-semibold tracking-[-0.02em] text-[var(--native-foreground)]">
                      {t(step.titleKey)}
                    </h2>
                    <p class="m-0 mt-0.5 text-[0.8125rem] leading-[1.5] text-[var(--native-muted)]">
                      {t(step.descKey)}
                    </p>
                  </div>

                  <Show when={step.kind === "link"}>
                    <a
                      href={installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] px-3 py-2 text-[0.8125rem] text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary-soft)_80%,var(--native-panel))]"
                    >
                      <Icon name="download" class="shrink-0" />
                      <span>{t("workspace.home.step1.installGuide")}</span>
                      <Icon name="square-arrow-top-right" class="shrink-0 text-[var(--native-dim)]" />
                    </a>
                  </Show>

                  <Show when={step.kind === "cmd"}>
                    <div class="inline-flex shrink-0 items-center gap-2 rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] px-3 py-2 font-[var(--native-font-mono)] text-[0.8125rem] text-[var(--native-foreground)]">
                      <span class="truncate">{t(step.cmdKey!)}</span>
                      <button
                        type="button"
                        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-dim)] transition-all motion-reduce:transition-none hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)]"
                        onClick={() => step.cmdKey && copy(t(step.cmdKey), step.id)}
                        aria-label="Copy command"
                        title="Copy command"
                      >
                        <Icon name={copiedId() === step.id ? "check" : "copy"} />
                      </button>
                    </div>
                  </Show>

                  <Show when={step.kind === "cta"}>
                    <Show when={dir()} fallback={
                      <span class="shrink-0 text-[0.8125rem] text-[var(--native-dim)]">
                         <Icon name="arrow-left" />
                      </span>
                    }>
                      {(entry) => (
                        <div class="flex shrink-0 flex-col gap-0.5 rounded-[3px] border border-[color:color-mix(in_oklab,var(--step-tone)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--native-success-soft)_55%,var(--native-panel))] px-3 py-1.5">
                          <span class="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--native-success-foreground)]">
                            {run()?.name}
                          </span>
                          <span class="truncate text-[0.75rem] leading-[1.4] text-[var(--native-muted)]" title={entry().path}>
                            {entry().path}
                          </span>
                        </div>
                      )}
                    </Show>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <div class="grid gap-4">
            <div class="rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_86%,var(--native-bg-subtle))] p-5 shadow-[var(--native-shadow-sm)]">
              <div class="mb-4">
                <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--native-dim)]">
                  {t("workspace.home.quickActions")}
                </p>
              </div>

              <div class="grid gap-3">
                <For each={acts}>
                  {(item) => (
                    <button
                      type="button"
                      class="group flex min-h-[3rem] items-center justify-between gap-3 rounded-[3px] border border-[color:color-mix(in_oklab,var(--act-tone)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--act-soft)_84%,var(--native-panel))] px-4 py-3 text-left transition-all motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-px hover:shadow-[var(--native-shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--native-panel)]"
                      style={{ "--act-tone": item.tone, "--act-soft": item.soft }}
                      onClick={item.run}
                    >
                      <span class="flex min-w-0 items-center gap-3 text-[0.875rem] font-medium text-[var(--native-foreground)]">
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--act-soft)_84%,var(--native-panel))] text-[var(--act-tone)] shadow-[var(--native-shadow-sm)]">
                          <Icon name={item.icon} />
                        </span>
                        <span class="truncate">{t(item.titleKey)}</span>
                      </span>
                      <Icon name={item.trail} class="shrink-0 text-[var(--act-tone)] transition-transform motion-reduce:transition-none group-hover:translate-x-0.5" />
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="relative overflow-hidden rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_72%,var(--native-panel))] p-5">
              <div class="absolute right-[-2.25rem] top-[-2.25rem] h-24 w-24 rounded-full bg-[color:color-mix(in_oklab,var(--native-primary)_10%,transparent)] blur-2xl" />
              <div class="relative flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)] bg-[var(--native-primary-soft)] text-[var(--native-primary)]">
                    <Icon name="warning" />
                  </div>
                  <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--native-primary)]">
                    {t("workspace.home.proTip")}
                  </p>
                </div>
                <div class="flex items-center justify-between gap-4 pl-[3.25rem]">
                  <p class="m-0 text-[0.875rem] leading-[1.5] text-[var(--native-primary-muted)]">
                    {t("workspace.home.proTip.status")}
                  </p>
                  <div class="inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] px-2.5 py-1.5 font-[var(--native-font-mono)] text-[0.8125rem] text-[var(--native-foreground)]">
                    <span>cs cloud status</span>
                    <button type="button" class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-dim)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)] focus:outline-none" onClick={() => copy("cs cloud status", "tip-status")} aria-label="Copy command" title="Copy command">
                      <Icon name={copiedId() === "tip-status" ? "check" : "copy"} />
                    </button>
                  </div>
                </div>
                <div class="flex items-center justify-between gap-4 pl-[3.25rem]">
                  <p class="m-0 text-[0.875rem] leading-[1.5] text-[var(--native-primary-muted)]">
                    {t("workspace.home.proTip.stop")}
                  </p>
                  <div class="inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_82%,var(--native-panel))] px-2.5 py-1.5 font-[var(--native-font-mono)] text-[0.8125rem] text-[var(--native-foreground)]">
                    <span>cs cloud stop</span>
                    <button type="button" class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-dim)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)] focus:outline-none" onClick={() => copy("cs cloud stop", "tip-stop")} aria-label="Copy command" title="Copy command">
                      <Icon name={copiedId() === "tip-stop" ? "check" : "copy"} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
