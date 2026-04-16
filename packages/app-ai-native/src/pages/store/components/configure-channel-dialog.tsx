import { useDialog } from "@opencode-ai/ui/context/dialog"
import QRCode from "qrcode"
import { createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { channelApi, type ChannelConfig, type ChannelType } from "../lib/api"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"

type Props = {
  channelType: string
  existing?: ChannelConfig
  onSaved: (payload: { channelType: string; name: string; config: Record<string, string> }) => Promise<void> | void
}

const TYPE_LABELS: Record<string, string> = {
  wechat: "WeChat",
  wecom: "WeCom",
}

export function ConfigureChannelDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [schema, setSchema] = createSignal<Array<{ key: string; label: string; type: string; required: boolean; placeholder?: string; helpText?: string }>>([])

  const [wechatState, setWechatState] = createSignal<"idle" | "loading" | "showing" | "scanned" | "done" | "error">(
    props.existing ? "done" : "idle"
  )
  const [wechatToken, setWechatToken] = createSignal("")
  const [qrDataUrl, setQrDataUrl] = createSignal("")
  const [qrError, setQrError] = createSignal("")

  const [form, setForm] = createStore({
    name: props.existing?.name ?? "",
    error: "",
    saving: false,
  })

  channelApi.available().then((res) => {
    const t = res.channelTypes.find((ct: ChannelType) => ct.type === props.channelType)
    if (t) setSchema(t.schema)
  })

  const typeLabel = () => TYPE_LABELS[props.channelType] ?? props.channelType

  let pollStopped = false
  onCleanup(() => { pollStopped = true })

  const startWechatLogin = async () => {
    setWechatState("loading")
    setQrError("")
    pollStopped = false
    try {
      const res = await channelApi.wechatQRCode()
      const dataUrl = await QRCode.toDataURL(res.qrcodeImageUrl, { width: 200, margin: 2 })
      setQrDataUrl(dataUrl)
      setWechatState("showing")

      while (!pollStopped) {
        const status = await channelApi.wechatLoginStatus(res.qrcode)
        if (status.status === "confirmed" && status.token) {
          setWechatToken(status.token)
          setWechatState("done")
          return
        }
        if (status.status === "scanned") {
          setWechatState("scanned")
        }
        if (status.status === "expired" || status.status === "canceled") {
          setWechatState("error")
          setQrError(language.t("channels.wechat.login.expired"))
          return
        }
        await new Promise<void>(r => setTimeout(r, 2000))
      }
    } catch {
      setWechatState("error")
      setQrError(language.t("channels.wechat.login.qrError"))
    }
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setForm("error", language.t("channels.add.error.nameRequired"))
      return
    }

    const config: Record<string, string> = {}
    if (props.channelType === "wechat") {
      const token = wechatToken()
      if (!token) {
        setForm("error", language.t("channels.add.error.wechatToken"))
        return
      }
      config.token = token
    } else {
      for (const field of schema()) {
        const el = document.getElementById(`channel-field-${field.key}`) as HTMLInputElement | null
        const val = el?.value?.trim() ?? ""
        if (field.required && !val) {
          setForm("error", `${field.label} ${language.t("channels.add.error.fieldRequired")}`)
          return
        }
        if (val) config[field.key] = val
      }
    }

    setForm("error", "")
    setForm("saving", true)
    try {
      await props.onSaved({
        channelType: props.channelType,
        name: form.name.trim(),
        config,
      })
      dialog.close()
    } catch (e) {
      setForm("error", e instanceof Error ? e.message : String(e))
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={`${props.existing ? language.t("common.edit") : language.t("channels.configure")} ${typeLabel()}`}
        maxWidth="500px"
        maxHeight="560px"
        footer={
          <>
            <button class="modal-btn modal-btn-ghost" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </button>
            <button class="modal-btn modal-btn-primary" type="submit" disabled={form.saving || (props.channelType === "wechat" && wechatState() !== "done")}>
              {form.saving ? language.t("common.saving") : language.t("channels.add.confirm")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("channels.add.name")} <span class="req">*</span>
            </label>
            <input
              autofocus
              value={form.name}
              onInput={(e) => setForm("name", e.currentTarget.value)}
              placeholder={language.t("channels.add.namePlaceholder")}
              class="modal-input"
            />
          </div>
        </div>

        <Show when={props.channelType === "wechat"}>
          <div class="modal-section">
            <div class="modal-section-title">{language.t("channels.add.wechat.config")}</div>
            <div class="modal-field" style={{ "text-align": "center" }}>
              <Show when={wechatState() === "idle" || wechatState() === "error"}>
                <button type="button" class="modal-btn modal-btn-primary" style={{ width: "100%" }} onClick={startWechatLogin}>
                  {language.t("channels.add.wechat.scanLogin")}
                </button>
                <Show when={qrError()}>
                  <p style={{ color: "#ef4444", "font-size": "13px", "margin-top": "0.5rem" }}>{qrError()}</p>
                </Show>
              </Show>

              <Show when={wechatState() === "loading"}>
                <p style={{ color: "var(--st-text-secondary)" }}>
                  {language.t("channels.wechat.login.loading")}
                </p>
              </Show>

              <Show when={wechatState() === "showing" || wechatState() === "scanned"}>
                <Show when={qrDataUrl()}>
                  <img
                    src={qrDataUrl()}
                    alt="WeChat QR Code"
                    style={{ width: "160px", height: "160px", "border-radius": "8px" }}
                  />
                </Show>
                <p style={{ color: "var(--st-text-secondary)", "font-size": "13px", "margin-top": "0.5rem" }}>
                  {wechatState() === "scanned"
                    ? language.t("channels.wechat.login.scanned")
                    : language.t("channels.wechat.login.scanHint")}
                </p>
              </Show>

              <Show when={wechatState() === "done"}>
                <span style={{ color: "#22c55e" }}>✓ {language.t("channels.add.wechat.loggedIn")}</span>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={props.channelType !== "wechat" && schema().length > 0}>
          <div class="modal-section">
            <div class="modal-section-title">{language.t("channels.add.config")}</div>
            <For each={schema()}>
              {(field) => (
                <div class="modal-field">
                  <label class="modal-label">
                    {field.label} {field.required ? <span class="req">*</span> : ""}
                  </label>
                  <input
                    id={`channel-field-${field.key}`}
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder ?? ""}
                    class="modal-input"
                    autocomplete="off"
                    value={props.existing?.config?.[field.key] ?? ""}
                  />
                  <Show when={field.helpText}>
                    <span style={{ "font-size": "12px", color: "var(--st-text-secondary)" }}>
                      {field.helpText}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {form.error && <p class="modal-error">{form.error}</p>}
      </Modal>
    </form>
  )
}
