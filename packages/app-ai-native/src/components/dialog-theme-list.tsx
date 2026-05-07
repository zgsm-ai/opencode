import { Component, createMemo } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { useTheme } from "@opencode-ai/ui/theme"
import { useLanguage } from "@/context/language"

export const DialogThemeList: Component = () => {
  const dialog = useDialog()
  const theme = useTheme()
  const language = useLanguage()

  const themeOptions = createMemo(() =>
    Object.entries(theme.themes()).map(([id, def]) => ({ id, name: def.name ?? id })),
  )

  return (
    <Dialog
      title={language.t("command.themes.title")}
      description={language.t("command.themes.description")}
    >
      <List
        items={themeOptions()}
        key={(t) => t.id}
        onSelect={(item) => {
          if (!item) return
          theme.setTheme(item.id)
          dialog.close()
        }}
      >
        {(t) => (
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">{t.name}</span>
            {t.id === theme.themeId() && (
              <span class="text-xs text-foreground-muted">{language.t("common.selected")}</span>
            )}
          </div>
        )}
      </List>
    </Dialog>
  )
}
