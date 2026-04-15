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
  const cmd = "cs cloud start"
  const [copied, setCopied] = createSignal(false)
  const steps = [
    {
      id: "01",
      tone: "var(--native-warning)",
      soft: "var(--native-warning-soft)",
      title: t("workspace.home.step1.title"),
      description: t("workspace.home.step1.description"),
      kind: "cmd",
    },
    {
      id: "02",
      tone: "var(--native-primary)",
      soft: "var(--native-primary-soft)",
      title: t("workspace.home.step2.title"),
      description: t("workspace.home.step2.description"),
      kind: "nav",
    },
    {
      id: "03",
      tone: "var(--native-success)",
      soft: "var(--native-success-soft)",
      title: t("workspace.home.step3.title"),
      description: t("workspace.home.step3.description"),
      kind: "cta",
    },
  ] as const
  const acts = [
    {
      icon: "store",
      title: t("workspace.home.browseStore"),
      tone: "var(--native-primary)",
      soft: "var(--native-primary-soft)",
      trail: "arrow-right",
      run: () => navigate("/store"),
    },
    {
      icon: "help",
      title: t("workspace.home.viewDocs"),
      tone: "var(--native-muted)",
      soft: "var(--native-surface)",
      trail: "square-arrow-top-right",
      run: () => platform.openLink("https://docs.costrict.ai"),
    },
  ] as const
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

  const copy = () => {
    const task = navigator.clipboard?.writeText(cmd)
    if (!task) return
    void task.then(() => {
      setCopied(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div class="native-page custom-scrollbar overflow-y-auto">
      <header class="native-page-header mx-auto w-full max-w-[1080px]">
        <h1 class="native-page-title">{t("workspace.home.title")}</h1>
        <p class="native-page-subtitle">{t("workspace.home.subtitle")}</p>
      </header>

      <div class="native-page-main mx-auto w-full max-w-[1080px]">
        <section class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18.5rem,0.9fr)]">
          <div class="grid gap-4 sm:grid-cols-2">
            <For each={steps.slice(0, 2)}>
              {(step) => (
                <article
                  class="native-panel relative flex min-h-[17rem] flex-col overflow-hidden p-5 transition-[transform,box-shadow,border-color] motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-px hover:shadow-[var(--native-shadow-md)]"
                  style={{ "--step-tone": step.tone, "--step-soft": step.soft }}
                >
                  <div class="mb-5">
                    <span class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--step-tone)_10%,transparent)] px-3 font-[var(--native-font-mono)] text-[0.875rem] font-semibold text-[var(--step-tone)]">
                      {step.id}
                    </span>
                  </div>

                  <h2 class="m-0 max-w-[16ch] font-[var(--native-font-display)] text-[1.125rem] font-semibold tracking-[-0.04em] text-[var(--native-foreground)]">
                    {step.title}
                  </h2>
                  <p class="mt-2 max-w-[34ch] text-[0.875rem] leading-[1.65] text-[var(--native-muted)]">
                    {step.description}
                  </p>

                  <div class="mt-auto pt-5">
                    <Show when={step.kind === "cmd"}>
                      <div class="native-code-chip w-full justify-between gap-3">
                        <span class="truncate">{cmd}</span>
                        <button
                          type="button"
                          class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-dim)] transition-all motion-reduce:transition-none hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--native-panel)]"
                          onClick={copy}
                          aria-label="Copy command"
                          title="Copy command"
                        >
                          <Icon name={copied() ? "check" : "copy"} />
                        </button>
                      </div>
                    </Show>


                  </div>
                </article>
              )}
            </For>

            <article
              class="native-panel relative flex min-h-[16.5rem] flex-col overflow-hidden p-5 sm:col-span-2 transition-[transform,box-shadow,border-color] motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-px hover:shadow-[var(--native-shadow-md)]"
              style={{ "--step-tone": steps[2].tone, "--step-soft": steps[2].soft }}
            >
              <div class="mb-5">
                <span class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--step-tone)_10%,transparent)] px-3 font-[var(--native-font-mono)] text-[0.875rem] font-semibold text-[var(--step-tone)]">
                  {steps[2].id}
                </span>
              </div>

              <div class="min-w-0">
                <div class="min-w-0">
                  <h2 class="m-0 max-w-[14ch] font-[var(--native-font-display)] text-[1.25rem] font-semibold tracking-[-0.04em] text-[var(--native-foreground)]">
                    {steps[2].title}
                  </h2>
                  <p class="mt-2 max-w-[40ch] text-[0.875rem] leading-[1.7] text-[var(--native-muted)]">
                    {steps[2].description}
                  </p>

                  <div class="mt-5 min-h-[2.75rem]">
                    <Show when={dir()}>
                      {(entry) => (
                        <div class="flex min-w-0 flex-col gap-1.5 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--step-tone)_16%,transparent)] bg-[color:color-mix(in_oklab,var(--step-soft)_55%,var(--native-panel))] px-3.5 py-3 shadow-[var(--native-shadow-sm)]">
                          <span class="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--native-success-foreground)]">
                            {run()?.name}
                          </span>
                          <span class="truncate text-[0.8125rem] leading-[1.5] text-[var(--native-muted)]" title={entry().path}>
                            {entry().path}
                          </span>
                        </div>
                      )}
                    </Show>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div class="grid gap-4">
            <div class="native-panel p-5">
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
                      class="group flex min-h-[3rem] items-center justify-between gap-3 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--act-tone)_20%,transparent)] bg-[color:color-mix(in_oklab,var(--act-soft)_84%,var(--native-panel))] px-4 py-3 text-left transition-all motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-px hover:shadow-[var(--native-shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--native-panel)]"
                      style={{ "--act-tone": item.tone, "--act-soft": item.soft }}
                      onClick={item.run}
                    >
                      <span class="flex min-w-0 items-center gap-3 text-[0.875rem] font-medium text-[var(--native-foreground)]">
                        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--act-soft)_84%,var(--native-panel))] text-[var(--act-tone)] shadow-[var(--native-shadow-sm)]">
                          <Icon name={item.icon} />
                        </span>
                        <span class="truncate">{item.title}</span>
                      </span>
                      <Icon name={item.trail} class="shrink-0 text-[var(--act-tone)] transition-transform motion-reduce:transition-none group-hover:translate-x-0.5" />
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="native-panel-soft relative overflow-hidden p-5">
              <div class="absolute right-[-2.25rem] top-[-2.25rem] h-24 w-24 rounded-full bg-[color:color-mix(in_oklab,var(--native-primary)_10%,transparent)] blur-2xl" />
              <div class="relative flex gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--native-radius-md)] bg-[var(--native-primary-soft)] text-[var(--native-primary)]">
                  <Icon name="warning" />
                </div>
                <div class="min-w-0">
                  <p class="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--native-primary)]">
                    {t("workspace.home.proTip")}
                  </p>
                  <p class="m-0 max-w-[34ch] text-[0.875rem] leading-[1.65] text-[var(--native-primary-muted)]">
                    {t("workspace.home.proTipContent")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
