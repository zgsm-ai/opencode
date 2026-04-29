import { For, createMemo } from "solid-js"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/context/language"
import { useOrgCascade } from "../../hooks/use-org-cascade"
import { createListCollection, SelectContent, SelectControl, SelectIndicator, SelectItem, SelectItemText, SelectList, SelectPositioner, SelectRoot, SelectTrigger, SelectValueText } from "@/components/ui/select"
import type { DateRangeValue, OrgCascadeValue } from "../../lib/types"

type Props = {
  value?: OrgCascadeValue
  dateRange?: DateRangeValue
  onChange: (value: OrgCascadeValue) => void
  class?: string
}

export function OrgCascadeSelect(props: Props) {
  const { t } = useLanguage()
  const cascade = useOrgCascade({
    value: props.value,
    dateRange: props.dateRange,
    onChange: props.onChange,
    t,
  })

  return (
    <div class={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-4", props.class)}>
      <For each={cascade.levels()}>
        {(item) => {
          const collection = createMemo(() =>
            createListCollection({
              items: [
                { value: "", label: t("common.all") },
                ...item.options.map((opt) => ({ value: opt, label: opt })),
              ],
              itemToValue: (i) => i.value,
              itemToString: (i) => i.label,
            }),
          )

          return (
            <label class="flex min-w-0 flex-col gap-2">
              <span class="text-[0.75rem] text-[var(--native-muted)]">{item.label}</span>
              <SelectRoot
                collection={collection()}
                value={[item.value]}
                disabled={item.disabled}
                onValueChange={(details) => {
                  void cascade.setLevel(item.level, details.value[0] ?? "")
                }}
                positioning={{ fitViewport: true, sameWidth: true }}
              >
                <SelectControl>
                  <SelectTrigger class="h-10 w-full">
                    <SelectValueText />
                    <SelectIndicator />
                  </SelectTrigger>
                </SelectControl>
                <SelectPositioner>
                  <SelectContent class="max-h-[min(20rem,calc(var(--available-height)-1rem))] overflow-y-auto">
                    <SelectList>
                      <For each={collection().items}>
                        {(option) => (
                          <SelectItem item={option}>
                            <SelectItemText>{option.label}</SelectItemText>
                          </SelectItem>
                        )}
                      </For>
                    </SelectList>
                  </SelectContent>
                </SelectPositioner>
              </SelectRoot>
            </label>
          )
        }}
      </For>
    </div>
  )
}

export default OrgCascadeSelect