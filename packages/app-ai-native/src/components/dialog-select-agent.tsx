import { Component, createMemo } from "solid-js"
import { useLocal } from "@/context/local"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useLanguage } from "@/context/language"

export const DialogSelectAgent: Component = () => {
  const local = useLocal()
  const language = useLanguage()
  const dialog = useDialog()

  const agents = createMemo(() => local.agent.list())

  return (
    <Dialog
      title={language.t("dialog.agent.select.title")}
      description={language.t("dialog.agent.select.description")}
    >
      <List
        search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.agent.empty")}
        key={(x) => x?.name ?? ""}
        items={agents}
        current={local.agent.current()}
        filterKeys={["name"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (x) {
            local.agent.set(x.name)
            dialog.close()
          }
        }}
      >
        {(agent) => (
          <div class="w-full flex items-center gap-x-2 text-13-regular">
            <span class="truncate capitalize">{agent.name}</span>
          </div>
        )}
      </List>
    </Dialog>
  )
}
