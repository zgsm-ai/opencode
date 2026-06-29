import { For, Show } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import type { Device } from "../types"
import { useLanguage } from "@/context/language"
import { CreateWorkspaceDialogContent } from "./create-workspace-dialog"

export type SelectDeviceDialogProps = {
  devices: Device[]
  workspaceNames?: readonly string[]
  onCreate: (device: Device, directory: string, name: string) => Promise<void> | void
}

export function SelectDeviceDialogContent(props: SelectDeviceDialogProps) {
  const language = useLanguage()
  const t = language.t
  const dialog = useDialog()

  const pick = (device: Device) => {
    dialog.show(() => (
      <CreateWorkspaceDialogContent
        device={device}
        workspaceNames={props.workspaceNames}
        onCreate={async (dir, name) => {
          await props.onCreate(device, dir, name)
        }}
      />
    ))
  }

  return (
    <Dialog
      class="w-full max-w-[480px] mx-auto"
      title={
        <div class="flex items-center gap-2.5">
          <div class="flex items-center justify-center size-8 rounded-lg bg-surface-raised-base">
            <Icon name="server" class="size-4 text-text-strong" />
          </div>
          <span class="text-14-medium text-text-strong">{t("workspace.onboarding.selectDevice.title")}</span>
        </div>
      }
    >
      <div class="flex flex-col gap-2 px-5 pb-5">
        <p class="m-0 text-12-regular text-text-weak">{t("workspace.onboarding.selectDevice.description")}</p>
        <For each={props.devices}>
          {(device) => (
            <button
              type="button"
              class="group flex w-full items-center gap-3 rounded-lg border border-border-weak-base bg-surface-base px-3 py-2.5 text-left transition-colors hover:border-border-strong-base hover:bg-surface-base-hover"
              onClick={() => pick(device)}
            >
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-raised-base">
                <Icon name="server" class="size-4 text-text-weak" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-13-medium text-text-strong">{device.displayName}</div>
                <div class="flex items-center gap-2 text-11-regular text-text-weak">
                  <Show when={device.platform}>
                    <span class="capitalize">{device.platform}</span>
                  </Show>
                  <Show when={device.version}>
                    <span>· v{device.version}</span>
                  </Show>
                </div>
              </div>
              <Icon name="chevron-right" class="size-4 shrink-0 text-text-weaker transition-colors group-hover:text-text-weak" />
            </button>
          )}
        </For>
      </div>
    </Dialog>
  )
}
