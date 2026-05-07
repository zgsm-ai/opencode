import { Component, createMemo } from "solid-js"
import { useLocal } from "@/context/local"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"

export const DialogSelectVariant: Component = () => {
  const local = useLocal()
  const language = useLanguage()
  const dialog = useDialog()

  const variants = createMemo(() => local.model.variant.list().map((name) => ({ name })))
  const currentVariant = () => {
    const name = local.model.variant.current()
    return name ? { name } : undefined
  }

  return (
    <Dialog
      title={language.t("dialog.variant.select.title")}
      description={language.t("dialog.variant.select.description")}
    >
      <List
        search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.variant.empty")}
        key={(x) => x?.name ?? ""}
        items={variants}
        current={currentVariant()}
        filterKeys={["name"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (x) {
            local.model.variant.set(x.name)
            dialog.close()
          }
        }}
      >
        {(variant) => (
          <div class="w-full flex items-center gap-x-2 text-13-regular">
            <span class="truncate">{variant.name}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
