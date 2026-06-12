import { createMemo, onMount } from "solid-js"
import { useSessionChat } from "@/context/session-chat"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

const ROOT_CLASS =
  "size-full flex flex-col justify-end items-start gap-4 flex-[1_0_0] self-stretch max-w-200 mx-auto 2xl:max-w-[1000px] px-6 pb-16"

export function NewSessionView() {
  const chat = useSessionChat()
  const language = useLanguage()

  const workspaceRoot = createMemo(() => chat.directory())

  onMount(() => {
    if (chat.vcs() !== undefined) return
    void chat.vcsLoad()
  })

  const branchLabel = createMemo(() => {
    const branch = chat.vcs()?.branch
    if (branch) return language.t("session.new.worktree.mainWithBranch", { branch })
    return language.t("session.new.worktree.main")
  })

  return (
    <div class={ROOT_CLASS}>
      <div class="text-20-medium text-text-weaker">{language.t("command.session.new")}</div>
      <div class="flex justify-center items-start gap-3 min-h-5">
        <Icon name="folder" size="small" class="mt-0.5 shrink-0" />
        <div class="text-12-medium text-text-weak select-text leading-5">
          {getDirectory(workspaceRoot())}
          <span class="text-text-strong">{getFilename(workspaceRoot())}</span>
        </div>
      </div>
      <div class="flex justify-center items-start gap-3 min-h-5">
        <Icon name="branch" size="small" class="mt-0.5 shrink-0" />
        <div class="text-12-medium text-text-weak select-text leading-5">{branchLabel()}</div>
      </div>
    </div>
  )
}
