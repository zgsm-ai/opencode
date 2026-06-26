import { useLanguage } from "@/context/language"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { SHENMA_ORIGIN } from "@/pages/store/lib/constants"
import { useWorkspace } from "../context"
import type { Device } from "../types"
import { CreateWorkspaceDialogContent } from "../components/create-workspace-dialog"
import { SelectDeviceDialogContent } from "../components/select-device-dialog"

type State = "no-device" | "device-ready" | "workspace-ready"

const installUrl = "https://docs.costrict.ai/csc/overview#%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B"
const install = "npm install -g @costrict/csc --registry=https://registry.npmjs.org/"
function Command(props: { id: string; value: string; copied: () => string | null; copy: (text: string, id: string) => void }) {
  const t = useLanguage().t
  return (
    <div class="flex min-w-0 items-center gap-2 rounded-[12px] border border-[color:color-mix(in_oklab,var(--native-border)_34%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_78%,var(--native-panel))] px-3 py-2 font-[var(--native-font-mono)] text-[0.8125rem] text-[var(--native-foreground)]">
      <span class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{props.value}</span>
      <button
        type="button"
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-dim)] transition-colors hover:bg-[var(--native-primary-soft)] hover:text-[var(--native-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)] cursor-pointer"
        onClick={() => props.copy(props.value, props.id)}
        aria-label={t("workspace.onboarding.copyCommand")}
        title={t("workspace.onboarding.copyCommand")}
      >
        <Icon name={props.copied() === props.id ? "check" : "copy"} />
      </button>
    </div>
  )
}

function Stepper(props: { state: State; select: () => void }) {
  const t = useLanguage().t
  const steps = [
    {
      key: "device",
      title: t("workspace.onboarding.step.device.title"),
      current: t("workspace.onboarding.step.device.current"),
      next: t("workspace.onboarding.step.device.next"),
      done: t("workspace.onboarding.step.device.done"),
    },
    {
      key: "project",
      title: t("workspace.onboarding.step.project.title"),
      current: t("workspace.onboarding.step.project.current"),
      next: t("workspace.onboarding.step.project.next"),
      done: t("workspace.onboarding.step.project.done"),
    },
  ]
  const index = () => props.state === "no-device" ? 0 : props.state === "device-ready" ? 1 : 2
  const view = (i: number) => {
    const step = steps[i]
    const done = () => i < index()
    const current = () => i === index()
    return (
      <div class="relative z-[1] flex min-w-0 items-start gap-3">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px_18px_13px_17px/17px_13px_18px_14px] border text-[0.8125rem] font-semibold shadow-[0_8px_18px_color-mix(in_oklab,var(--native-primary)_10%,transparent)]"
          classList={{
            "border-[var(--native-primary)] bg-[var(--native-primary)] text-[var(--native-primary-foreground)]": current(),
            "border-[color:color-mix(in_oklab,var(--native-primary)_36%,transparent)] bg-[var(--native-primary-soft)] text-[var(--native-primary)]": done(),
            "border-[var(--native-border)] bg-[var(--native-panel)] text-[var(--native-dim)]": !current() && !done(),
          }}
        >
          <Show when={done()} fallback={i + 1}>
            <Icon name="check" />
          </Show>
        </span>
        <div class="min-w-0 pt-0.5">
          <div
            class="truncate text-[0.875rem] font-semibold"
            classList={{
              "text-[var(--native-foreground)]": current() || done(),
              "text-[var(--native-dim)]": !current() && !done(),
            }}
          >
            {step.title}
          </div>
          <Show
            when={step.key === "project" && current()}
            fallback={
              <div
                class="mt-0.5 truncate text-[0.75rem]"
                classList={{
                  "text-[var(--native-primary)]": current(),
                  "text-[var(--native-success-foreground)]": done(),
                  "text-[var(--native-muted)]": !current() && !done(),
                }}
              >
                {done() ? step.done : current() ? step.current : step.next}
              </div>
            }
          >
            <button
              type="button"
              class="mt-0.5 truncate text-[0.75rem] text-[var(--native-primary)] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--native-ring)] cursor-pointer"
              onClick={props.select}
            >
              {step.current}
            </button>
          </Show>
        </div>
      </div>
    )
  }

  return (
    <div class="grid gap-3 px-3 py-4 sm:grid-cols-[max-content_minmax(4rem,1fr)_max-content_minmax(4rem,1fr)] sm:items-start">
      {view(0)}
      <div class="mt-3 hidden h-2 rounded-full bg-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] sm:block" aria-hidden="true">
        <div
          class="h-full rounded-full bg-[linear-gradient(90deg,var(--native-primary),color-mix(in_oklab,#38d8d2_70%,var(--native-panel)))] transition-[width] duration-300"
          classList={{
            "w-[20%]": props.state === "no-device",
            "w-full": props.state !== "no-device",
          }}
        />
      </div>
      {view(1)}
      <div class="mt-3 hidden h-2 rounded-full bg-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] sm:block" aria-hidden="true">
        <div
          class="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,#38d8d2_62%,var(--native-panel)),var(--native-primary))] transition-[width] duration-300"
          classList={{
            "w-0": props.state !== "workspace-ready",
            "w-full": props.state === "workspace-ready",
          }}
        />
      </div>
    </div>
  )
}

function Help(props: { copied: () => string | null; copy: (text: string, id: string) => void }) {
  const t = useLanguage().t
  const [open, setOpen] = createSignal(false)
  return (
    <div class="rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_26%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))]">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[0.875rem] font-medium text-[var(--native-foreground)] cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
      >
        <span>{t("workspace.onboarding.help.title")}</span>
        <Icon name={open() ? "chevron-down" : "chevron-right"} class="text-[var(--native-dim)]" />
      </button>
      <Show when={open()}>
        <div class="grid gap-3 border-t border-[color:color-mix(in_oklab,var(--native-border)_22%,transparent)] px-4 py-4">
          <a href={installUrl} target="_blank" rel="noopener noreferrer" class="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] font-medium text-[var(--native-primary)] hover:underline cursor-pointer">
            {t("workspace.onboarding.help.docs")}
            <Icon name="square-arrow-top-right" />
          </a>
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="grid gap-1.5">
              <p class="m-0 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.help.status")}</p>
              <Command id="help-status" value="csc cloud status" copied={props.copied} copy={props.copy} />
            </div>
            <div class="grid gap-1.5">
              <p class="m-0 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.help.stop")}</p>
              <Command id="help-stop" value="csc cloud stop" copied={props.copied} copy={props.copy} />
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

function NoDevice(props: {
  copied: () => string | null
  copy: (text: string, id: string) => void
  refresh: () => void
  login: string
  start: string
  env?: string
}) {
  const t = useLanguage().t
  return (
    <>
      <section class="rounded-[20px] bg-[linear-gradient(145deg,color-mix(in_oklab,var(--native-panel)_82%,transparent),color-mix(in_oklab,var(--native-surface)_54%,var(--native-panel))_60%,color-mix(in_oklab,var(--native-bg-subtle)_48%,var(--native-panel)))] p-5 shadow-[30px_18px_68px_-42px_color-mix(in_oklab,var(--native-primary)_28%,transparent),0_14px_40px_-30px_color-mix(in_oklab,var(--native-foreground)_18%,transparent)] backdrop-blur">
        <div class="mb-4">
          <p class="m-0 text-[0.8125rem] font-semibold text-[var(--native-primary)]">{t("workspace.onboarding.currentAction")}</p>
          <h2 class="m-0 mt-2.5 text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--native-foreground)]">{t("workspace.onboarding.noDevice.title")}</h2>
          <p class="m-0 mt-2 text-[0.875rem] leading-[1.5] text-[var(--native-muted)]">
            {t("workspace.onboarding.noDevice.description")}
          </p>
        </div>

        <div class="grid gap-4">
          <div class="grid gap-2">
            <h3 class="m-0 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">{t("workspace.onboarding.install.title")}</h3>
            <p class="m-0 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.install.description")}</p>
            <Command id="install" value={install} copied={props.copied} copy={props.copy} />
          </div>

          <Show when={props.env}>
            {(cmd) => (
              <div class="grid gap-2">
                <h3 class="m-0 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">{t("workspace.onboarding.env.title")}</h3>
                <p class="m-0 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.env.description")}</p>
                <Command id="env" value={cmd()} copied={props.copied} copy={props.copy} />
              </div>
            )}
          </Show>

          <div class="grid gap-2">
            <h3 class="m-0 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">{t("workspace.onboarding.login.title")}</h3>
            <p class="m-0 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.login.description")}</p>
            <Command id="login" value={props.login} copied={props.copied} copy={props.copy} />
          </div>

          <div class="grid gap-2">
            <h3 class="m-0 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">{t("workspace.onboarding.start.title")}</h3>
            <p class="m-0 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.start.description")}</p>
            <Command id="start" value={props.start} copied={props.copied} copy={props.copy} />
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-3 rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_26%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <span class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--native-radius-full)] bg-[var(--native-primary-soft)]">
            <span class="absolute h-3 w-3 rounded-full bg-[var(--native-primary)] opacity-25 animate-ping" />
            <span class="h-2.5 w-2.5 rounded-full bg-[var(--native-primary)]" />
          </span>
          <div>
            <p class="m-0 text-[0.9375rem] font-semibold text-[var(--native-foreground)]">{t("workspace.onboarding.waiting.title")}</p>
            <p class="m-0 mt-0.5 text-[0.8125rem] text-[var(--native-muted)]">{t("workspace.onboarding.waiting.description")}</p>
          </div>
        </div>
        <Button type="button" variant="secondary" size="small" onClick={props.refresh}>
          {t("workspace.onboarding.waiting.check")}
        </Button>
      </section>
    </>
  )
}

function DeviceReady(props: {
  device: Device
  open: (device: Device) => void
  showGuide: () => void
}) {
  const t = useLanguage().t
  const rows = [
    { label: t("workspace.onboarding.device.name"), value: props.device.displayName },
    { label: t("workspace.onboarding.device.platform"), value: props.device.platform || t("workspace.onboarding.unknown") },
    { label: t("workspace.onboarding.device.cli"), value: props.device.version || t("workspace.onboarding.unknown") },
    { label: t("workspace.onboarding.device.status"), value: t("workspace.device.online") },
  ]
  return (
    <section class="rounded-[20px] bg-[linear-gradient(145deg,color-mix(in_oklab,var(--native-panel)_82%,transparent),color-mix(in_oklab,#f4fbff_54%,var(--native-panel))_60%,color-mix(in_oklab,#fff7fb_48%,var(--native-panel)))] p-5 shadow-[30px_18px_68px_-42px_color-mix(in_oklab,var(--native-primary)_28%,transparent),0_14px_40px_-30px_rgba(15,23,42,0.18)] backdrop-blur">
      <div class="flex items-start gap-4">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px_18px_13px_17px/17px_13px_18px_14px] bg-[var(--native-success-soft)] text-[var(--native-success-foreground)]">
          <Icon name="check" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="m-0 text-[1.375rem] font-semibold tracking-[-0.035em] text-[var(--native-foreground)]">{t("workspace.onboarding.deviceReady.title")}</h2>
          <p class="m-0 mt-2 text-[0.875rem] leading-[1.65] text-[var(--native-muted)]">
            {t("workspace.onboarding.deviceReady.description")}
          </p>
        </div>
      </div>

      <div class="mt-5 rounded-[12px] border border-[color:color-mix(in_oklab,var(--native-border)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_76%,transparent)] p-4">
        <For each={rows}>
          {(row, i) => (
            <div class="flex items-center justify-between gap-4 py-2" classList={{ "border-t border-[color:color-mix(in_oklab,var(--native-border)_18%,transparent)]": i() > 0 }}>
              <span class="text-[0.8125rem] text-[var(--native-muted)]">{row.label}</span>
              <span class="min-w-0 truncate text-right text-[0.875rem] font-medium text-[var(--native-foreground)]">{row.value}</span>
            </div>
          )}
        </For>
      </div>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={() => props.open(props.device)}>
          {t("workspace.onboarding.deviceReady.selectProject")}
        </Button>
        <Button type="button" variant="secondary" onClick={props.showGuide}>
          {t("workspace.onboarding.deviceReady.connectAnother")}
        </Button>
      </div>
    </section>
  )
}

function WorkspaceReady(props: { onConnectAnother: () => void; onCreateWorkspace: () => void }) {
  const t = useLanguage().t
  return (
    <section class="rounded-[3px] border border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-5 shadow-[var(--native-shadow-sm)]">
      <h2 class="m-0 text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--native-foreground)]">{t("workspace.onboarding.workspaceReady.title")}</h2>
      <p class="m-0 mt-2 whitespace-nowrap text-[0.875rem] leading-[1.65] text-[var(--native-muted)]">
        {t("workspace.onboarding.workspaceReady.description")}
      </p>
      <p class="m-0 mt-1.5 whitespace-nowrap text-[0.8125rem] leading-[1.65] text-[var(--native-muted)]">
        {t("workspace.onboarding.workspaceReady.hint")}
      </p>
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={props.onCreateWorkspace}>
          {t("workspace.onboarding.deviceReady.selectProject")}
        </Button>
        <Button type="button" variant="secondary" onClick={props.onConnectAnother}>
          {t("workspace.onboarding.deviceReady.connectAnother")}
        </Button>
      </div>
    </section>
  )
}

export default function WorkspaceHome() {
  const t = useLanguage().t
  const navigate = useNavigate()
  const dialog = useDialog()
  const work = useWorkspace()
  const [copied, setCopied] = createSignal<string | null>(null)
  const [guide, setGuide] = createSignal(false)
  const preview = createMemo<State | undefined>(() => {
    if (!import.meta.env.DEV) return
    const value = new URLSearchParams(window.location.search).get("preview")
    if (value === "no-device" || value === "device-ready" || value === "workspace-ready") return value
  })
  const isShenma = typeof window !== "undefined" && window.location.origin === SHENMA_ORIGIN
  const sample: Device = {
    id: "preview-device",
    deviceId: "preview-device",
    displayName: t("workspace.onboarding.previewDevice"),
    platform: "macOS",
    version: "preview",
    userId: "preview",
    status: "online",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
  const online = createMemo(() => preview() === "device-ready" ? [sample] : work.devices().filter((device) => device.status === "online"))
  const usable = createMemo(() => work.workspaces().filter((item) => item.deviceUniqueId && item.deviceStatus === "online" && (item.directories?.length ?? 0) > 0))
  const state = createMemo<State>(() => {
    const value = preview()
    if (value) return value
    if (usable().length > 0) return "workspace-ready"
    if (online().length > 0) return "device-ready"
    return "no-device"
  })
  let seen = ""
  createEffect(() => {
    const ids = online().map((device) => device.id).join("|")
    if (!seen) {
      seen = ids
      return
    }
    if (ids !== seen) {
      seen = ids
      if (guide() && ids) setGuide(false)
    }
  })
  const env = createMemo(() => isShenma ? t("workspace.home.step3.shenma.cmd", { url: SHENMA_ORIGIN }) : undefined)
  const login = createMemo(() => isShenma ? "csc cloud login" : t("workspace.home.step3.cmd"))
  const start = createMemo(() => isShenma ? "csc cloud login" : t("workspace.home.step4.cmd"))

  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  const copy = (text: string, id: string) => {
    const task = navigator.clipboard?.writeText(text)
    if (!task) return
    void task.then(() => {
      setCopied(id)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setCopied(null), 1600)
    })
  }

  const open = (device: Device) => {
    dialog.show(() => (
      <CreateWorkspaceDialogContent
        device={device}
        workspaceNames={work.workspaces().map((workspace) => workspace.name)}
        onCreate={async (dir: string, name: string) => {
          if (preview()) return
          await work.createWorkspace(device.id, dir, name)
        }}
      />
    ))
  }
  const createWorkspaceFromPicker = () => {
    if (preview()) return
    const devices = online()
    const onCreate = async (device: Device, dir: string, name: string) => {
      await work.createWorkspace(device.id, dir, name)
    }
    const workspaceNames = work.workspaces().map((workspace) => workspace.name)
    if (devices.length <= 1) {
      if (!devices[0]) return
      open(devices[0])
      return
    }
    dialog.show(() => (
      <SelectDeviceDialogContent
        devices={devices}
        workspaceNames={workspaceNames}
        onCreate={onCreate}
      />
    ))
  }
  const refresh = () => {
    work.refreshDevices()
  }
  const select = () => {
    const device = online()[0]
    if (device) open(device)
  }

  return (
    <div class="thin-scrollbar flex min-h-full min-w-0 flex-col overflow-y-auto overflow-x-clip bg-[linear-gradient(180deg,var(--native-panel)_0%,color-mix(in_oklab,var(--native-bg-subtle)_82%,var(--native-panel))_100%)] px-[clamp(1rem,2vw,2rem)] py-10">
      <main class="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
        <header>
          <h1 class="m-0 font-[var(--native-font-display)] text-[2rem] font-semibold leading-[1.12] tracking-[-0.05em] text-[var(--native-foreground)]">
            {t("workspace.onboarding.title")}
          </h1>
          <p class="m-0 mt-3 text-[0.975rem] leading-[1.55] text-[var(--native-muted)]">
            {t("workspace.onboarding.subtitle")}
          </p>
        </header>

        <Stepper state={state()} select={select} />

        <Show
          when={guide()}
          fallback={
            <Show when={state() === "workspace-ready"} fallback={
              <Show when={state() === "device-ready"} fallback={
                <NoDevice
                  copied={copied}
                  copy={copy}
                  refresh={refresh}
                  login={login()}
                  start={start()}
                  env={env()}
                />
              }>
                <Show when={online()[0]}>
                  {(device) => <DeviceReady device={device()} open={open} showGuide={() => setGuide(true)} />}
                </Show>
              </Show>
            }>
              <WorkspaceReady onConnectAnother={() => setGuide(true)} onCreateWorkspace={createWorkspaceFromPicker} />
            </Show>
          }
        >
          <NoDevice
            copied={copied}
            copy={copy}
            refresh={refresh}
            login={login()}
            start={start()}
            env={env()}
          />
        </Show>

        <Help copied={copied} copy={copy} />

        <button
          type="button"
          class="w-fit text-left text-[0.8125rem] text-[var(--native-muted)] transition-colors"
          onClick={() => navigate("/store")}
        >
          <span>{t("workspace.onboarding.storePrefix")}</span>
          <span class="ml-1 font-semibold text-[var(--native-primary)] hover:underline cursor-pointer">{t("workspace.onboarding.storeLink")}</span>
        </button>
      </main>
    </div>
  )
}
