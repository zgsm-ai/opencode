import { createSignal, createEffect, Show } from "solid-js"
import QRCode from "qrcode"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { useLanguage } from "@/context/language"

export function SessionQrCodeContent(props: {
  url: string
  sessionTitle: string
}) {
  const language = useLanguage()
  const t = language.t
  const [dataUrl, setDataUrl] = createSignal("")
  const [error, setError] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [copied, setCopied] = createSignal(false)

  createEffect(() => {
    const url = props.url
    if (!url) {
      setError(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    setDataUrl("")
    QRCode.toDataURL(url, { width: 240, margin: 2 })
      .then((dataUrl) => {
        setDataUrl(dataUrl)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  })

  return (
    <Dialog title={t("session.qrcode.title")} fit>
      <div class="flex flex-col items-center gap-4 px-6 pb-4 pt-2">
        <p class="text-13-regular text-text-weak text-center">
          {t("session.qrcode.description")}
        </p>
        <Show
          when={!error()}
          fallback={
            <div class="flex items-center justify-center size-[240px] rounded-lg border border-border bg-background-stronger">
              <span class="text-13-regular text-text-weak">{t("session.qrcode.error")}</span>
            </div>
          }
        >
          <Show
            when={!loading() && dataUrl()}
            fallback={
              <div class="flex items-center justify-center size-[240px] rounded-lg border border-border bg-background-stronger">
                <span class="text-13-regular text-text-weak">{t("common.loading")}</span>
              </div>
            }
          >
            <img
              src={dataUrl()}
              alt="QR Code"
              class="size-[240px] rounded-lg border border-border"
            />
          </Show>
        </Show>
        <Button
          variant="secondary"
          size="normal"
          onClick={async () => {
            await navigator.clipboard.writeText(props.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied() ? t("session.share.copy.copied") : t("session.share.copy.copyLink")}
        </Button>
      </div>
    </Dialog>
  )
}