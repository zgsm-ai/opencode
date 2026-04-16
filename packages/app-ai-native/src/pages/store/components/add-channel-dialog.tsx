import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createResource, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { channelApi, type ChannelType } from "../lib/api"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"
import { WechatLoginDialog } from "./wechat-login-dialog"

type Props = {
  onCreated: (ch: { channelType: string; name: string; config: Record<string, string> }) => Promise<void> | void
}

export function AddChannelDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [available] = createResource(() => channelApi.available())
  const [selectedType, setSelectedType] = createSignal<string | null>(null)
  const [wechatToken, setWechatToken] = createSignal("")

  const [form, setForm] = createStore({
    name: "",
    error: "",
    saving: false,
  })

  const types = () => available()?.channelTypes ?? []

  const selected = (): ChannelType | undefined =>
    types().find((t) => t.type === selectedType())

  const typeLabel = (t: string) => {
    const map: Record<string, string> = {
      wechat: "WeChat",
      wecom: "WeCom",
    }
    return map[t] ?? t
  }

  const openWechatLogin = () => {
    dialog.show(() => (
      <WechatLoginDialog
        onToken={(token) => setWechatToken(token)}
      />
    ))
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    const type = selectedType()
    if (!type) {
      setForm("error", language.t("channels.add.error.typeRequired"))
      return
    }
    if (!form.name.trim()) {
      setForm("error", language.t("channels.add.error.nameRequired"))
      return
    }

    const config: Record<string, string> = {}
    if (type === "wechat") {
      const token = wechatToken()
      if (!token) {
        setForm("error", language.t("channels.add.error.wechatToken"))
        return
      }
      config.token = token
    } else {
      for (const field of selected()?.schema ?? []) {
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
      await props.onCreated({
        channelType: type,
        name: form.name.trim(),
        config,
      })
      dialog.close()
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Modal
        title={language.t("channels.add.title")}
        maxWidth="500px"
        maxHeight="560px"
        footer={
          <>
            <button class="modal-btn modal-btn-ghost" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </button>
            <button class="modal-btn modal-btn-primary" type="submit" disabled={form.saving}>
              {form.saving ? language.t("common.saving") : language.t("channels.add.confirm")}
            </button>
          </>
        }
      >
        <div class="modal-section">
          <div class="modal-field">
            <label class="modal-label">
              {language.t("channels.add.type")} <span class="req">*</span>
            </label>
            <div style={{ display: "flex", gap: "0.5rem", "flex-wrap": "wrap" }}>
              <For each={types()}>
                {(t) => (
                  <button
                    type="button"
                    class={`modal-btn ${selectedType() === t.type ? "modal-btn-primary" : "modal-btn-ghost"}`}
                    style={{ "font-size": "13px" }}
                    onClick={() => setSelectedType(t.type)}
                  >
                    {typeLabel(t.type)}
                  </button>
                )}
              </For>
              <Show when={types().length === 0}>
                <span style={{ color: "var(--st-text-secondary)", "font-size": "13px" }}>
                  {language.t("channels.add.noTypes")}
                </span>
              </Show>
            </div>
          </div>

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

        <Show when={selectedType() === "wechat"}>
          <div class="modal-section">
            <div class="modal-section-title">
              {language.t("channels.add.wechat.config")}
            </div>
            <div class="modal-field">
              <Show
                when={wechatToken()}
                fallback={
                  <button
                    type="button"
                    class="modal-btn modal-btn-primary"
                    style={{ width: "100%" }}
                    onClick={openWechatLogin}
                  >
                    {language.t("channels.add.wechat.scanLogin")}
                  </button>
                }
              >
                <div style={{ display: "flex", "align-items": "center", gap: "0.5rem" }}>
                  <span style={{ color: "#22c55e" }}>✓ {language.t("channels.add.wechat.loggedIn")}</span>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={selectedType() && selectedType() !== "wechat"}>
          <div class="modal-section">
            <div class="modal-section-title">
              {language.t("channels.add.config")}
            </div>
            <For each={selected()?.schema ?? []}>
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
