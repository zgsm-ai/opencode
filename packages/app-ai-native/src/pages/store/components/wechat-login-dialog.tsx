import { useDialog } from "@opencode-ai/ui/context/dialog"
import QRCode from "qrcode"
import { createSignal, onCleanup, Show } from "solid-js"
import { channelApi } from "../lib/api"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"

type Props = {
  onToken: (token: string) => void
}

export function WechatLoginDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [state, setState] = createSignal<"loading" | "qrcode" | "scanned" | "confirmed" | "error">("loading")
  const [qrcodeDataUrl, setQrcodeDataUrl] = createSignal("")
  const [qrcodeId, setQrcodeId] = createSignal("")
  const [error, setError] = createSignal("")

  let stopped = false

  const startPoll = async (id: string) => {
    while (!stopped) {
      try {
        const res = await channelApi.wechatLoginStatus(id)
        if (res.status === "confirmed" && res.token) {
          setState("confirmed")
          props.onToken(res.token)
          dialog.close()
          return
        }
        if (res.status === "scanned") {
          setState("scanned")
        }
        if (res.status === "expired" || res.status === "canceled") {
          setState("error")
          setError(language.t("channels.wechat.login.expired"))
          return
        }
      } catch {
        setState("error")
        setError(language.t("channels.wechat.login.pollError"))
        return
      }
      await new Promise<void>(r => setTimeout(r, 2000))
    }
  }

  const fetchQR = async () => {
    setState("loading")
    setError("")
    try {
      const res = await channelApi.wechatQRCode()
      setQrcodeId(res.qrcode)
      const dataUrl = await QRCode.toDataURL(res.qrcodeImageUrl, { width: 200, margin: 2 })
      setQrcodeDataUrl(dataUrl)
      setState("qrcode")
      startPoll(res.qrcode)
    } catch {
      setState("error")
      setError(language.t("channels.wechat.login.qrError"))
    }
  }

  fetchQR()

  onCleanup(() => { stopped = true })

  return (
    <Modal
      title={language.t("channels.wechat.login.title")}
      maxWidth="400px"
      maxHeight="480px"
      footer={
        <button class="modal-btn modal-btn-ghost" type="button" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </button>
      }
    >
      <div class="modal-section" style={{ "text-align": "center", padding: "1rem 0" }}>
        <Show when={state() === "loading"}>
          <p style={{ color: "var(--st-text-secondary)" }}>
            {language.t("channels.wechat.login.loading")}
          </p>
        </Show>

        <Show when={state() === "qrcode" || state() === "scanned"}>
          <Show when={qrcodeDataUrl()}>
            <img
              src={qrcodeDataUrl()}
              alt="WeChat QR Code"
              style={{ width: "200px", height: "200px", "margin-bottom": "0.75rem", "border-radius": "8px" }}
            />
          </Show>
          <p style={{ color: "var(--st-text-secondary)", "font-size": "13px" }}>
            {state() === "scanned"
              ? language.t("channels.wechat.login.scanned")
              : language.t("channels.wechat.login.scanHint")}
          </p>
        </Show>

        <Show when={state() === "confirmed"}>
          <p style={{ color: "#22c55e", "font-weight": 500 }}>
            ✓ {language.t("channels.wechat.login.success")}
          </p>
        </Show>

        <Show when={state() === "error"}>
          <p style={{ color: "#ef4444", "margin-bottom": "0.75rem" }}>{error()}</p>
          <button class="modal-btn modal-btn-primary" type="button" onClick={fetchQR}>
            {language.t("channels.wechat.login.retry")}
          </button>
        </Show>
      </div>
    </Modal>
  )
}
