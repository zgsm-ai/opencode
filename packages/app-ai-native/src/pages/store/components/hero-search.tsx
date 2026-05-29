// src/pages/store/components/hero-search.tsx
import { createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"

export default function HeroSearch() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchText, setSearchText] = createSignal("")

  const handleSearch = () => {
    const query = searchText().trim()
    if (query) {
      navigate(`/store/search?q=${encodeURIComponent(query)}`)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  return (
    <div class="flex flex-col items-center gap-6 py-12">
      <h1 class="text-4xl font-bold text-[var(--native-foreground)]">
        {language.t("store.browse.hero.title")}
      </h1>

      <div class="relative w-full max-w-2xl">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--native-muted)]">
          <Icon name="magnifying-glass" class="size-5" />
        </div>
        <input
          type="text"
          value={searchText()}
          onInput={(e) => setSearchText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={language.t("store.browse.hero.placeholder")}
          class="h-14 w-full rounded-full border border-[var(--native-border)] bg-[var(--native-panel)] pl-12 pr-4 text-lg text-[var(--native-foreground)] placeholder:text-[var(--native-muted)] focus:border-[var(--native-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--native-primary)] focus:ring-opacity-20"
        />
      </div>
    </div>
  )
}
