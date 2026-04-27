import { A } from "@solidjs/router"
import { useLanguage } from "@/context/language"

export default function Back(props: { href?: string; label?: string }) {
  const language = useLanguage()
  const href = props.href?.trim() || "/kanban"

  return (
    <A href={href} class="inline-flex w-fit max-w-full self-start items-center gap-2 text-sm text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)]">
      <span>&lt;</span>
      <span>{props.label?.trim() || language.t("kanban.back")}</span>
    </A>
  )
}
