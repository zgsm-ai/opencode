import { A, useLocation } from "@solidjs/router"
import { useLanguage } from "@/context/language"

const NAV_ITEMS = [
  { href: "/store-admin", labelKey: "store.admin.dashboard", icon: "home", exact: true },
  { href: "/store-admin/capabilities", labelKey: "store.admin.myCapabilities", icon: "package" },
  { href: "/store-admin/favorites", labelKey: "store.admin.favorites", icon: "star" },
  { href: "/store-admin/received", labelKey: "store.admin.received", icon: "inbox" },
  { href: "/store-admin/sent", labelKey: "store.admin.sent", icon: "send" },
] as const

export default function AdminSidebar() {
  const location = useLocation()
  const language = useLanguage()

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return location.pathname === href
    return location.pathname.startsWith(href)
  }

  return (
    <aside class="w-56 shrink-0 border-r border-[var(--native-border)] bg-[var(--native-panel)]">
      <nav class="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <A
            href={item.href}
            class={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive(item.href, "exact" in item ? item.exact : false)
                ? "bg-[var(--native-surface)] text-[var(--native-foreground)]"
                : "text-[var(--native-muted)] hover:bg-[var(--native-surface)] hover:text-[var(--native-foreground)]"
            }`}
          >
            <span class="size-4">{/* Icon placeholder */}</span>
            <span>{language.t(item.labelKey as Parameters<typeof language.t>[0])}</span>
          </A>
        ))}
      </nav>
    </aside>
  )
}
