import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import type { ContentMode } from "../lib/content"
import { ACCEPTED_ARCHIVE_TYPES, formatBytes, isArchive } from "../lib/constants"

type ContentFieldProps = {
   archive?: boolean
   mode: ContentMode
   text: string
   file: File | null
   rows?: number
   textClass?: string
   /** True when editing an item that was previously uploaded as an archive. */
   existingArchive?: boolean
   onModeChange: (mode: ContentMode) => void
   onTextChange: (text: string) => void
   onFileChange: (file: File | null) => void
   onError?: (message: string) => void
}

const modes = ["text", "archive"] as const

export function ContentField(props: ContentFieldProps) {
   const language = useLanguage()
   const [store, setStore] = createStore({ drag: false })
   let input: HTMLInputElement | undefined

   const mode = () => (props.archive === false ? "text" : props.mode)

   function fail() {
      props.onError?.(language.t("store.capabilityDialog.content.invalid"))
   }

   function pick(file: File | undefined | null) {
      if (!file) return
      if (!isArchive(file.name)) {
         fail()
         return
      }
      props.onError?.("")
      props.onFileChange(file)
   }

   function drop(e: DragEvent) {
      e.preventDefault()
      setStore("drag", false)
      pick(e.dataTransfer?.files[0])
   }

   function over(e: DragEvent) {
      e.preventDefault()
      setStore("drag", true)
   }

   function leave(e: DragEvent) {
      e.preventDefault()
      setStore("drag", false)
   }

   return (
      <div>
         <div class="mb-2 flex items-center justify-between gap-3">
            <label class="block text-12-regular text-text-strong">{language.t("store.capabilityDialog.field.content")}</label>
            <Show when={props.archive !== false}>
               <div class="flex items-center gap-2">
                  {modes.map((item) => (
                     <button
                        type="button"
                        class="rounded-md border px-3 py-1.5 text-sm transition-colors"
                        classList={{
                           "border-border-weak-base text-text-weak": mode() !== item,
                           "border-border-strong bg-surface-info-base/20 text-text-strong": mode() === item,
                        }}
                        onClick={() => props.onModeChange(item)}
                     >
                        {language.t(`store.capabilityDialog.content.${item}`)}
                     </button>
                  ))}
               </div>
            </Show>
         </div>

         <Show
            when={mode() === "text"}
            fallback={
               <div
                  role="button"
                  tabIndex={0}
                  class="rounded-xl bg-background-base p-5 transition-colors outline-none"
                  classList={{
                     "cursor-pointer border border-border-weak-base": !!props.file,
                     "border border-border-strong bg-surface-info-base/10": store.drag,
                     "border-2 border-dashed border-border-weak-base cursor-pointer hover:border-border-strong": !props.file && !store.drag,
                  }}
                  onDrop={drop}
                  onDragOver={over}
                  onDragLeave={leave}
                  onClick={() => input?.click()}
                  onKeyDown={(e) => {
                     if (e.key !== "Enter" && e.key !== " ") return
                     e.preventDefault()
                     input?.click()
                  }}
               >
                  <input
                     ref={(el) => {
                        input = el
                     }}
                     type="file"
                     accept={ACCEPTED_ARCHIVE_TYPES}
                     class="hidden"
                     onChange={(e) => {
                        pick(e.currentTarget.files?.[0])
                        e.currentTarget.value = ""
                     }}
                  />

                  <Show
                     when={props.file}
                     fallback={
                        <div class="flex flex-col items-center gap-2 py-6 text-center text-text-weak">
                           <div class="flex size-10 items-center justify-center rounded-full bg-surface-info-base/20 text-icon-info-base">
                              <Icon name="cloud-upload" size="large" />
                           </div>
                           <Show
                              when={props.existingArchive}
                              fallback={
                                 <>
                                    <div class="text-sm text-text-strong">{language.t("store.capabilityDialog.content.dropHint")}</div>
                                    <div class="text-12-regular">{language.t("store.capabilityDialog.content.accepted")}</div>
                                 </>
                              }
                           >
                              <div class="text-sm text-text-strong">{language.t("store.sourceType.archive")}</div>
                              <div class="text-12-regular">{language.t("store.capabilityDialog.content.replaceHint")}</div>
                           </Show>
                        </div>
                     }
                  >
                     {(file) => (
                        <div class="flex items-start justify-between gap-4">
                           <div class="min-w-0">
                              <div class="truncate text-sm text-text-strong">{file().name}</div>
                              <div class="mt-1 text-12-regular text-text-weak">{formatBytes(file().size)}</div>
                           </div>
                           <Button
                              type="button"
                              size="small"
                              variant="ghost"
                              icon="trash"
                              class="shrink-0"
                              onClick={(e: MouseEvent) => {
                                 e.stopPropagation()
                                 props.onError?.("")
                                 props.onFileChange(null)
                              }}
                           >
                              {language.t("store.capabilityDialog.content.remove")}
                           </Button>
                        </div>
                     )}
                  </Show>
               </div>
            }
         >
            <textarea
               value={props.text}
               onInput={(e) => props.onTextChange(e.currentTarget.value)}
               rows={props.rows ?? 10}
               class={props.textClass}
            />
         </Show>
      </div>
   )
}
