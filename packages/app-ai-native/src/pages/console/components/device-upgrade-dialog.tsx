import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import type { UpdateCheckResponse } from "@/pages/workspace/types"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"

type DeviceUpgradeDialogProps = {
  deviceName: string
  currentVersion: string
  update: UpdateCheckResponse
  onConfirm: () => Promise<void> | void
}

export function DeviceUpgradeDialog(props: DeviceUpgradeDialogProps) {
  const d = useDialog()
  const language = useLanguage()

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return ""
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <Modal
      title={language.t("store.devices.upgrade.confirmTitle")}
      maxWidth="480px"
      maxHeight="420px"
      footer={
        <>
          <Button variant="outline" size="sm" type="button" onClick={() => d.close()}>
            {language.t("store.devices.upgrade.cancel")}
          </Button>
          <Button size="sm" type="button" onClick={() => { props.onConfirm(); d.close() }}>
            {language.t("store.devices.upgrade.confirm")}
          </Button>
        </>
      }
    >
      <div class="modal-section">
        <p class="text-[0.8125rem] leading-[1.6] text-[var(--native-muted)]">
          {language.t("store.devices.upgrade.confirmDescription", {
            device: props.deviceName,
            current: props.currentVersion,
            target: props.update.version,
          })}
        </p>
        {props.update.changelog && (
          <div class="modal-field mt-3">
            <label class="modal-label">{language.t("store.devices.upgrade.changelog")}</label>
            <div class="max-h-40 overflow-y-auto rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_42%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_60%,transparent)] p-3 text-[0.8125rem] leading-[1.6] text-[var(--native-foreground)]">
              {props.update.changelog}
            </div>
          </div>
        )}
        {props.update.size > 0 && (
          <div class="mt-2 flex items-center gap-2 text-[0.75rem] text-[var(--native-muted)]">
            <span>{language.t("store.devices.upgrade.size")}:</span>
            <span>{formatSize(props.update.size)}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
