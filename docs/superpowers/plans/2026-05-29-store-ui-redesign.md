# Store UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the skills store UI with separate browse (/store) and admin (/store-admin) sections, implementing a modern open-source community aesthetic (Hugging Face / GitHub Marketplace style).

**Architecture:** Split store into two independent sections: browse pages for discovery (card-based layouts, search, detail views) and admin pages for management (dashboard, tables, bulk operations). Share only data layer (API, types, auth) and minimal display components.

**Tech Stack:** SolidJS, TypeScript, Tailwind CSS, existing UI library components

**Spec:** `docs/superpowers/specs/2026-05-29-store-ui-redesign.md`

---

## Phase 1: Architecture & Routing

### Task 1: Create store-admin Directory Structure

**Files:**
- Create: `src/pages/store-admin/index.ts`
- Create: `src/pages/store-admin/pages/dashboard.tsx`
- Create: `src/pages/store-admin/pages/my-capabilities.tsx`
- Create: `src/pages/store-admin/pages/favorites.tsx`
- Create: `src/pages/store-admin/pages/received.tsx`
- Create: `src/pages/store-admin/pages/sent.tsx`
- Create: `src/pages/store-admin/components/admin-layout.tsx`
- Create: `src/pages/store-admin/components/admin-sidebar.tsx`

- [ ] **Step 1: Create admin-layout component**

```tsx
// src/pages/store-admin/components/admin-layout.tsx
import type { ParentProps } from "solid-js"

export default function AdminLayout(props: ParentProps) {
  return (
    <div class="flex h-full w-full">
      <div class="flex-1 min-w-0 overflow-hidden">
        {props.children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create admin-sidebar component**

```tsx
// src/pages/store-admin/components/admin-sidebar.tsx
import { A, useLocation } from "@solidjs/router"
import { createMemo } from "solid-js"
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
            <span>{language.t(item.labelKey)}</span>
          </A>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 3: Create placeholder page components**

```tsx
// src/pages/store-admin/pages/dashboard.tsx
export default function Dashboard() {
  return (
    <div class="p-6">
      <h1 class="text-2xl font-bold text-[var(--native-foreground)]">Dashboard</h1>
      <p class="mt-2 text-[var(--native-muted)]">Dashboard placeholder</p>
    </div>
  )
}
```

```tsx
// src/pages/store-admin/pages/my-capabilities.tsx
export default function MyCapabilities() {
  return (
    <div class="p-6">
      <h1 class="text-2xl font-bold text-[var(--native-foreground)]">My Capabilities</h1>
      <p class="mt-2 text-[var(--native-muted)]">My capabilities placeholder</p>
    </div>
  )
}
```

```tsx
// src/pages/store-admin/pages/favorites.tsx
export default function Favorites() {
  return (
    <div class="p-6">
      <h1 class="text-2xl font-bold text-[var(--native-foreground)]">Favorites</h1>
      <p class="mt-2 text-[var(--native-muted)]">Favorites placeholder</p>
    </div>
  )
}
```

```tsx
// src/pages/store-admin/pages/received.tsx
export default function Received() {
  return (
    <div class="p-6">
      <h1 class="text-2xl font-bold text-[var(--native-foreground)]">Received</h1>
      <p class="mt-2 text-[var(--native-muted)]">Received placeholder</p>
    </div>
  )
}
```

```tsx
// src/pages/store-admin/pages/sent.tsx
export default function Sent() {
  return (
    <div class="p-6">
      <h1 class="text-2xl font-bold text-[var(--native-foreground)]">Sent</h1>
      <p class="mt-2 text-[var(--native-muted)]">Sent placeholder</p>
    </div>
  )
}
```

- [ ] **Step 4: Create store-admin index**

```tsx
// src/pages/store-admin/index.ts
export { default as AdminLayout } from "./components/admin-layout"
export { default as Dashboard } from "./pages/dashboard"
export { default as MyCapabilities } from "./pages/my-capabilities"
export { default as Favorites } from "./pages/favorites"
export { default as Received } from "./pages/received"
export { default as Sent } from "./pages/sent"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/store-admin/
git commit -m "feat(store-admin): scaffold admin directory structure"
```

---

### Task 2: Update Routes

**Files:**
- Modify: `src/routes.tsx` (add /store-admin routes)

- [ ] **Step 1: Add lazy imports for store-admin pages**

In `src/routes.tsx`, after the existing store imports (around line 10-12), add:

```tsx
const AdminLayout = lazy(() => import("@/pages/store-admin").then((m) => ({ default: m.AdminLayout })))
const AdminDashboard = lazy(() => import("@/pages/store-admin").then((m) => ({ default: m.Dashboard })))
const AdminMyCapabilities = lazy(() => import("@/pages/store-admin").then((m) => ({ default: m.MyCapabilities })))
const AdminFavorites = lazy(() => import("@/pages/store-admin").then((m) => ({ default: m.Favorites })))
const AdminReceived = lazy(() => import("@/pages/store-admin").then((m) => ({ default: m.Received })))
const AdminSent = lazy(() => import("@/pages/store-admin").then((m) => ({ default: m.Sent })))
```

- [ ] **Step 2: Add /store-admin route config**

In `src/routes.tsx`, in the `routeConfig` array (around line 108-200), add after the existing /store route:

```tsx
{
  path: "/store-admin",
  component: AdminLayout,
  auth: true,
  children: [
    { path: "/", component: AdminDashboard },
    { path: "/capabilities", component: AdminMyCapabilities },
    { path: "/favorites", component: AdminFavorites },
    { path: "/received", component: AdminReceived },
    { path: "/sent", component: AdminSent },
  ],
},
```

- [ ] **Step 3: Verify routes compile**

Run: `cd packages/app-ai-native && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Test routing in browser**

Start dev server: `bun run dev:demo`
Navigate to: `http://localhost:3000/store-admin`
Expected: See "Dashboard" placeholder page

- [ ] **Step 5: Commit**

```bash
git add src/routes.tsx
git commit -m "feat(routes): add /store-admin routes"
```

---

### Task 3: Create Browse Layout

**Files:**
- Create: `src/pages/store/components/browse-layout.tsx`

- [ ] **Step 1: Create browse-layout component**

```tsx
// src/pages/store/components/browse-layout.tsx
import type { ParentProps } from "solid-js"
import { Toast } from "@opencode-ai/ui/toast"

export default function BrowseLayout(props: ParentProps) {
  return (
    <>
      <div class="flex h-full w-full min-h-0 flex-col overflow-x-hidden">
        <div class="thin-scrollbar relative flex-1 min-h-0 overflow-x-hidden overflow-y-auto bg-[var(--native-bg)]">
          {props.children}
        </div>
      </div>
      <Toast.Region />
    </>
  )
}
```

- [ ] **Step 2: Update store index to export browse-layout**

Modify `src/pages/store/index.ts`:

```tsx
export { default as StoreLayout } from "./components/browse-layout"
export { default as StoreHome } from "./pages/home"
export { default as StoreManager } from "./pages/manager"
export { default as MobileStoreLayout } from "./mobile/layout"
export { default as MobileStoreDetail } from "./mobile/detail"
```

Note: Changed from `./components/layout` to `./components/browse-layout`

- [ ] **Step 3: Verify app still works**

Run: `bun run dev:demo`
Navigate to: `http://localhost:3000/store`
Expected: Store home page still loads (layout is similar)

- [ ] **Step 4: Commit**

```bash
git add src/pages/store/components/browse-layout.tsx src/pages/store/index.ts
git commit -m "feat(store): create browse-layout component"
```

---

## Phase 2: Browse Frontend

### Task 4: Create Hero Search Component

**Files:**
- Create: `src/pages/store/components/hero-search.tsx`

- [ ] **Step 1: Create hero-search component**

```tsx
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
          <Icon name="search" class="size-5" />
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
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/en.ts`, add after existing store keys:

```tsx
"store.browse.hero.title": "Discover AI Capabilities",
"store.browse.hero.placeholder": "Search skills, subagents, commands...",
```

In `src/i18n/zh.ts`, add:

```tsx
"store.browse.hero.title": "发现 AI 能力",
"store.browse.hero.placeholder": "搜索技能、子代理、命令...",
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/components/hero-search.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add hero-search component"
```

---

### Task 5: Create Type Tabs Component

**Files:**
- Create: `src/pages/store/components/type-tabs.tsx`

- [ ] **Step 1: Create type-tabs component**

```tsx
// src/pages/store/components/type-tabs.tsx
import { createResource, For } from "solid-js"
import { A } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { itemApi } from "../lib/api"

const TYPES = [
  { value: "skill", labelKey: "store.browse.type.skills", icon: "sparkles", color: "#F59E0B" },
  { value: "subagent", labelKey: "store.browse.type.subagents", icon: "brain", color: "#3B82F6" },
  { value: "command", labelKey: "store.browse.type.commands", icon: "console", color: "#10B981" },
  { value: "mcp", labelKey: "store.browse.type.mcp", icon: "mcp", color: "#8B5CF6" },
  { value: "plugin", labelKey: "store.browse.type.plugins", icon: "configuration", color: "#EC4899" },
] as const

export default function TypeTabs() {
  const language = useLanguage()

  const [stats] = createResource(async () => {
    const counts = await Promise.all(
      TYPES.map(async (type) => {
        const result = await itemApi.list({ type: type.value, page: 1, pageSize: 1 })
        return [type.value, result.total] as const
      })
    )
    return Object.fromEntries(counts)
  })

  return (
    <div class="flex flex-wrap justify-center gap-3">
      <For each={TYPES}>
        {(type) => (
          <A
            href={`/store/search?type=${type.value}`}
            class="flex items-center gap-2 rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] px-4 py-2 text-sm font-medium text-[var(--native-foreground)] transition-all hover:border-[color:var(--type-color)] hover:shadow-md"
            style={{ "--type-color": type.color }}
          >
            <Icon name={type.icon as any} class="size-4" style={{ color: type.color }} />
            <span>{language.t(type.labelKey)}</span>
            {stats()?.[type.value] !== undefined && (
              <span class="rounded-full bg-[var(--native-surface)] px-2 py-0.5 text-xs text-[var(--native-muted)]">
                {stats()![type.value].toLocaleString()}
              </span>
            )}
          </A>
        )}
      </For>
    </div>
  )
}
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/en.ts`:

```tsx
"store.browse.type.skills": "Skills",
"store.browse.type.subagents": "Subagents",
"store.browse.type.commands": "Commands",
"store.browse.type.mcp": "MCP Servers",
"store.browse.type.plugins": "Plugins",
```

In `src/i18n/zh.ts`:

```tsx
"store.browse.type.skills": "技能",
"store.browse.type.subagents": "子代理",
"store.browse.type.commands": "命令",
"store.browse.type.mcp": "MCP 服务器",
"store.browse.type.plugins": "插件",
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/components/type-tabs.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add type-tabs component"
```

---

### Task 6: Create Capability Card Component

**Files:**
- Create: `src/pages/store/components/capability-card.tsx`

- [ ] **Step 1: Create capability-card component**

```tsx
// src/pages/store/components/capability-card.tsx
import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import type { CapabilityItem } from "../lib/api"
import SecurityTag from "./security-tag"

const TYPE_META: Record<string, { icon: string; color: string }> = {
  skill: { icon: "sparkles", color: "#F59E0B" },
  subagent: { icon: "brain", color: "#3B82F6" },
  command: { icon: "console", color: "#10B981" },
  mcp: { icon: "mcp", color: "#8B5CF6" },
  plugin: { icon: "configuration", color: "#EC4899" },
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function CapabilityCard(props: {
  item: CapabilityItem
  onClick?: () => void
}) {
  const language = useLanguage()
  const meta = () => TYPE_META[props.item.itemType] ?? TYPE_META.skill
  const description = () => {
    const desc = props.item.descriptions?.[language.locale()] ?? props.item.description
    return desc || ""
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="group flex h-60 w-full flex-col rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[color:var(--type-color)] hover:shadow-lg"
      style={{ "--type-color": meta().color }}
    >
      {/* Header */}
      <div class="flex items-start gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{
            "background-color": `color-mix(in srgb, ${meta().color} 12%, var(--native-panel))`,
            color: meta().color,
          }}
        >
          <Icon name={meta().icon as any} class="size-5" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-base font-semibold text-[var(--native-foreground)]">
            {props.item.name}
          </h3>
          <p class="text-xs text-[var(--native-muted)]">
            {props.item.itemType} · by {props.item.createdBy}
          </p>
        </div>
      </div>

      {/* Description */}
      <p class="mt-3 line-clamp-2 text-sm text-[var(--native-muted)]">
        {description()}
      </p>

      {/* Tags */}
      <Show when={props.item.tags && props.item.tags.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          {props.item.tags?.slice(0, 2).map((tag) => (
            <span class="rounded-full bg-[var(--native-surface)] px-2 py-0.5 text-xs text-[var(--native-muted)]">
              #{tag.slug}
            </span>
          ))}
          <Show when={(props.item.tags?.length ?? 0) > 2}>
            <span class="text-xs text-[var(--native-muted)]">
              +{(props.item.tags?.length ?? 0) - 2}
            </span>
          </Show>
        </div>
      </Show>

      {/* Footer stats */}
      <div class="mt-auto flex items-center justify-between pt-3 text-xs text-[var(--native-muted)]">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <LocalIcon name="star" size="small" />
            {formatCompact(props.item.favoriteCount ?? 0)}
          </span>
          <span class="flex items-center gap-1">
            <LocalIcon name="download" size="small" />
            {formatCompact(props.item.installCount ?? 0)}
          </span>
          <span class="flex items-center gap-1">
            <LocalIcon name="eye" size="small" />
            {formatCompact(props.item.previewCount ?? 0)}
          </span>
        </div>
        <SecurityTag status={props.item.securityStatus} />
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/store/components/capability-card.tsx
git commit -m "feat(store): add capability-card component"
```

---

### Task 7: Create Featured Carousel Component

**Files:**
- Create: `src/pages/store/components/featured-carousel.tsx`

- [ ] **Step 1: Create featured-carousel component**

```tsx
// src/pages/store/components/featured-carousel.tsx
import { createResource, For } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { itemApi } from "../lib/api"
import CapabilityCard from "./capability-card"

export default function FeaturedCarousel() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [featured] = createResource(async () => {
    const result = await itemApi.list({
      sortBy: "installCount",
      sortOrder: "desc",
      page: 1,
      pageSize: 8,
    })
    return result.items
  })

  return (
    <section class="px-6 py-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-bold text-[var(--native-foreground)]">
          {language.t("store.browse.featured")}
        </h2>
        <button
          type="button"
          onClick={() => navigate("/store/search")}
          class="text-sm text-[var(--native-primary)] hover:underline"
        >
          {language.t("store.browse.seeAll")} →
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <For each={featured()}>
          {(item) => (
            <CapabilityCard
              item={item}
              onClick={() => navigate(`/store/${item.slug}`)}
            />
          )}
        </For>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/en.ts`:

```tsx
"store.browse.featured": "Featured",
"store.browse.seeAll": "See all",
```

In `src/i18n/zh.ts`:

```tsx
"store.browse.featured": "精选推荐",
"store.browse.seeAll": "查看全部",
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/components/featured-carousel.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add featured-carousel component"
```

---

### Task 8: Create Category Grid Component

**Files:**
- Create: `src/pages/store/components/category-grid.tsx`

- [ ] **Step 1: Create category-grid component**

```tsx
// src/pages/store/components/category-grid.tsx
import { createResource, For } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { categoryApi, itemApi } from "../lib/api"

export default function CategoryGrid() {
  const language = useLanguage()
  const navigate = useNavigate()

  const [categories] = createResource(async () => {
    const cats = await categoryApi.list()
    // For each category, fetch top 3 items
    const catsWithItems = await Promise.all(
      cats.map(async (cat) => {
        const result = await itemApi.list({
          category: cat.slug,
          page: 1,
          pageSize: 3,
        })
        return { ...cat, items: result.items, total: result.total }
      })
    )
    return catsWithItems
  })

  return (
    <section class="px-6 py-8">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-xl font-bold text-[var(--native-foreground)]">
          {language.t("store.browse.categories")}
        </h2>
        <button
          type="button"
          onClick={() => navigate("/store/search")}
          class="text-sm text-[var(--native-primary)] hover:underline"
        >
          {language.t("store.browse.seeAll")} →
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <For each={categories()}>
          {(cat) => (
            <div class="rounded-xl border border-[var(--native-border)] bg-[var(--native-panel)] p-4">
              <h3 class="mb-3 text-base font-semibold text-[var(--native-foreground)]">
                {cat.names?.[language.locale()] ?? cat.slug}
              </h3>
              <div class="space-y-2">
                <For each={cat.items.slice(0, 2)}>
                  {(item) => (
                    <button
                      type="button"
                      onClick={() => navigate(`/store/${item.slug}`)}
                      class="block w-full truncate text-left text-sm text-[var(--native-muted)] hover:text-[var(--native-primary)]"
                    >
                      {item.name}
                    </button>
                  )}
                </For>
              </div>
              <Show when={cat.total > 2}>
                <button
                  type="button"
                  onClick={() => navigate(`/store/search?category=${cat.slug}`)}
                  class="mt-2 text-xs text-[var(--native-primary)] hover:underline"
                >
                  +{cat.total - 2} more →
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/en.ts`:

```tsx
"store.browse.categories": "Categories",
```

In `src/i18n/zh.ts`:

```tsx
"store.browse.categories": "分类",
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/components/category-grid.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add category-grid component"
```

---

### Task 9: Create Capability List Item Component

**Files:**
- Create: `src/pages/store/components/capability-list-item.tsx`

- [ ] **Step 1: Create capability-list-item component**

```tsx
// src/pages/store/components/capability-list-item.tsx
import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { LocalIcon } from "@/components/local-icon"
import { useLanguage } from "@/context/language"
import type { CapabilityItem } from "../lib/api"
import SecurityTag from "./security-tag"

const TYPE_META: Record<string, { icon: string; color: string }> = {
  skill: { icon: "sparkles", color: "#F59E0B" },
  subagent: { icon: "brain", color: "#3B82F6" },
  command: { icon: "console", color: "#10B981" },
  mcp: { icon: "mcp", color: "#8B5CF6" },
  plugin: { icon: "configuration", color: "#EC4899" },
}

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatDate(iso?: string) {
  if (!iso) return ""
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function CapabilityListItem(props: {
  item: CapabilityItem
  onClick?: () => void
}) {
  const language = useLanguage()
  const meta = () => TYPE_META[props.item.itemType] ?? TYPE_META.skill
  const description = () => {
    const desc = props.item.descriptions?.[language.locale()] ?? props.item.description
    return desc || ""
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      class="group flex w-full flex-col gap-2 rounded-lg border border-[var(--native-border)] bg-[var(--native-panel)] p-4 text-left transition-all hover:border-[color:var(--type-color)] hover:shadow-md"
      style={{ "--type-color": meta().color }}
    >
      {/* Header row */}
      <div class="flex items-start gap-3">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            "background-color": `color-mix(in srgb, ${meta().color} 12%, var(--native-panel))`,
            color: meta().color,
          }}
        >
          <Icon name={meta().icon as any} class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-base font-semibold text-[var(--native-foreground)]">
            {props.item.name}
          </h3>
          <p class="text-xs text-[var(--native-muted)]">
            {props.item.itemType} · {props.item.category} · by {props.item.createdBy}
          </p>
        </div>
        <SecurityTag status={props.item.securityStatus} />
      </div>

      {/* Description */}
      <p class="line-clamp-2 text-sm text-[var(--native-muted)]">
        {description()}
      </p>

      {/* Tags */}
      <Show when={props.item.tags && props.item.tags.length > 0}>
        <div class="flex flex-wrap gap-1.5">
          {props.item.tags?.slice(0, 3).map((tag) => (
            <span class="rounded-full bg-[var(--native-surface)] px-2 py-0.5 text-xs text-[var(--native-muted)]">
              #{tag.slug}
            </span>
          ))}
        </div>
      </Show>

      {/* Footer stats */}
      <div class="flex items-center justify-between text-xs text-[var(--native-muted)]">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <LocalIcon name="star" size="small" />
            {formatCompact(props.item.favoriteCount ?? 0)}
          </span>
          <span class="flex items-center gap-1">
            <LocalIcon name="download" size="small" />
            {formatCompact(props.item.installCount ?? 0)}
          </span>
          <span class="flex items-center gap-1">
            <LocalIcon name="eye" size="small" />
            {formatCompact(props.item.previewCount ?? 0)}
          </span>
        </div>
        <span>Updated {formatDate(props.item.updatedAt)}</span>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/store/components/capability-list-item.tsx
git commit -m "feat(store): add capability-list-item component"
```

---

### Task 10: Create Search Filters Component

**Files:**
- Create: `src/pages/store/components/search-filters.tsx`

- [ ] **Step 1: Create search-filters component**

```tsx
// src/pages/store/components/search-filters.tsx
import { createResource, For } from "solid-js"
import { useLanguage } from "@/context/language"
import { categoryApi, itemFilterApi } from "../lib/api"

const TYPES = [
  { value: "", labelKey: "store.browse.filter.all" },
  { value: "skill", labelKey: "store.browse.type.skills" },
  { value: "subagent", labelKey: "store.browse.type.subagents" },
  { value: "command", labelKey: "store.browse.type.commands" },
  { value: "mcp", labelKey: "store.browse.type.mcp" },
  { value: "plugin", labelKey: "store.browse.type.plugins" },
] as const

export default function SearchFilters(props: {
  selectedType?: string
  selectedCategories?: string[]
  selectedSecurityStatuses?: string[]
  onTypeChange?: (type: string) => void
  onCategoryChange?: (categories: string[]) => void
  onSecurityChange?: (statuses: string[]) => void
}) {
  const language = useLanguage()

  const [categories] = createResource(() => categoryApi.list())
  const [filterOptions] = createResource(() => itemFilterApi.list())

  const toggleCategory = (slug: string) => {
    const current = props.selectedCategories ?? []
    const next = current.includes(slug)
      ? current.filter((c) => c !== slug)
      : [...current, slug]
    props.onCategoryChange?.(next)
  }

  const toggleSecurity = (status: string) => {
    const current = props.selectedSecurityStatuses ?? []
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]
    props.onSecurityChange?.(next)
  }

  return (
    <aside class="w-60 shrink-0 space-y-6 border-r border-[var(--native-border)] bg-[var(--native-panel)] p-4">
      {/* Type filter */}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-[var(--native-foreground)]">
          {language.t("store.browse.filter.type")}
        </h3>
        <div class="space-y-1">
          <For each={TYPES}>
            {(type) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--native-surface)]">
                <input
                  type="radio"
                  name="type"
                  checked={props.selectedType === type.value}
                  onChange={() => props.onTypeChange?.(type.value)}
                  class="accent-[var(--native-primary)]"
                />
                <span class="text-[var(--native-muted)]">
                  {language.t(type.labelKey)}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>

      {/* Category filter */}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-[var(--native-foreground)]">
          {language.t("store.browse.filter.category")}
        </h3>
        <div class="space-y-1">
          <For each={categories()}>
            {(cat) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--native-surface)]">
                <input
                  type="checkbox"
                  checked={props.selectedCategories?.includes(cat.slug)}
                  onChange={() => toggleCategory(cat.slug)}
                  class="accent-[var(--native-primary)]"
                />
                <span class="text-[var(--native-muted)]">
                  {cat.names?.[language.locale()] ?? cat.slug}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>

      {/* Security filter */}
      <div>
        <h3 class="mb-2 text-sm font-semibold text-[var(--native-foreground)]">
          {language.t("store.browse.filter.security")}
        </h3>
        <div class="space-y-1">
          <For each={filterOptions()?.securityStatuses ?? []}>
            {(status) => (
              <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--native-surface)]">
                <input
                  type="checkbox"
                  checked={props.selectedSecurityStatuses?.includes(status.value)}
                  onChange={() => toggleSecurity(status.value)}
                  class="accent-[var(--native-primary)]"
                />
                <span class="text-[var(--native-muted)]">
                  {status.names?.[language.locale()] ?? status.value}
                </span>
              </label>
            )}
          </For>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/en.ts`:

```tsx
"store.browse.filter.type": "Type",
"store.browse.filter.category": "Category",
"store.browse.filter.security": "Security",
"store.browse.filter.all": "All",
```

In `src/i18n/zh.ts`:

```tsx
"store.browse.filter.type": "类型",
"store.browse.filter.category": "分类",
"store.browse.filter.security": "安全等级",
"store.browse.filter.all": "全部",
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/components/search-filters.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add search-filters component"
```

---

### Task 11: Create Top Navigation Bar

**Files:**
- Create: `src/pages/store/components/top-nav.tsx`

- [ ] **Step 1: Create top-nav component**

```tsx
// src/pages/store/components/top-nav.tsx
import { A, useNavigate } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { Icon } from "@opencode-ai/ui/icon"

export default function TopNav() {
  const language = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()

  return (
    <nav class="flex h-14 items-center justify-between border-b border-[var(--native-border)] bg-[var(--native-panel)] px-6">
      {/* Left: Logo */}
      <A href="/store" class="flex items-center gap-2">
        <span class="text-lg font-bold text-[var(--native-foreground)]">
          {language.t("store.browse.title")}
        </span>
      </A>

      {/* Right: Actions */}
      <div class="flex items-center gap-3">
        {/* Admin button */}
        {auth.user() && (
          <button
            type="button"
            onClick={() => navigate("/store-admin")}
            class="flex items-center gap-2 rounded-lg bg-[var(--native-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--native-primary-hover)]"
          >
            <Icon name="settings" class="size-4" />
            <span>{language.t("store.browse.admin")}</span>
          </button>
        )}

        {/* User avatar */}
        {auth.user() && (
          <div class="size-8 overflow-hidden rounded-full bg-[var(--native-surface)]">
            {auth.user()?.avatarUrl ? (
              <img src={auth.user()!.avatarUrl} alt={auth.user()!.name} class="size-full object-cover" />
            ) : (
              <div class="flex size-full items-center justify-center text-sm font-medium text-[var(--native-muted)]">
                {auth.user()?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/en.ts`:

```tsx
"store.browse.title": "Skills Store",
"store.browse.admin": "Manage",
```

In `src/i18n/zh.ts`:

```tsx
"store.browse.title": "技能商店",
"store.browse.admin": "管理",
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/components/top-nav.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add top-nav component"
```

---

### Task 12: Rewrite Home Page

**Files:**
- Modify: `src/pages/store/pages/home.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite home page**

Replace entire content of `src/pages/store/pages/home.tsx`:

```tsx
import TopNav from "../components/top-nav"
import HeroSearch from "../components/hero-search"
import TypeTabs from "../components/type-tabs"
import FeaturedCarousel from "../components/featured-carousel"
import CategoryGrid from "../components/category-grid"

export default function Home() {
  return (
    <>
      <TopNav />
      <div class="mx-auto max-w-7xl">
        <HeroSearch />
        <TypeTabs />
        <FeaturedCarousel />
        <CategoryGrid />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify home page renders**

Run: `bun run dev:demo`
Navigate to: `http://localhost:3000/store`
Expected: See new home page with hero search, type tabs, featured carousel, and category grid

- [ ] **Step 3: Commit**

```bash
git add src/pages/store/pages/home.tsx
git commit -m "feat(store): rewrite home page with new browse layout"
```

---

### Task 13: Create Search Page

**Files:**
- Create: `src/pages/store/pages/search.tsx`
- Modify: `src/routes.tsx` (add search route)

- [ ] **Step 1: Create search page**

```tsx
// src/pages/store/pages/search.tsx
import { createResource, createSignal, For, Show } from "solid-js"
import { useNavigate, useSearchParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { itemApi } from "../lib/api"
import TopNav from "../components/top-nav"
import SearchFilters from "../components/search-filters"
import CapabilityListItem from "../components/capability-list-item"

export default function SearchPage() {
  const language = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [selectedType, setSelectedType] = createSignal(searchParams.type ?? "")
  const [selectedCategories, setSelectedCategories] = createSignal<string[]>(
    searchParams.category ? [searchParams.category] : []
  )
  const [selectedSecurity, setSelectedSecurity] = createSignal<string[]>([])

  const [results] = createResource(
    () => ({
      query: searchParams.q ?? "",
      type: selectedType() || undefined,
      categories: selectedCategories(),
      security: selectedSecurity(),
    }),
    async (params) => {
      const result = await itemApi.list({
        search: params.query,
        type: params.type,
        categories: params.categories.length > 0 ? params.categories : undefined,
        securityStatuses: params.security.length > 0 ? params.security : undefined,
        page: 1,
        pageSize: 20,
      })
      return result
    }
  )

  const handleTypeChange = (type: string) => {
    setSelectedType(type)
  }

  const handleCategoryChange = (categories: string[]) => {
    setSelectedCategories(categories)
  }

  const handleSecurityChange = (statuses: string[]) => {
    setSelectedSecurity(statuses)
  }

  return (
    <>
      <TopNav />
      <div class="flex h-[calc(100vh-3.5rem)]">
        <SearchFilters
          selectedType={selectedType()}
          selectedCategories={selectedCategories()}
          selectedSecurityStatuses={selectedSecurity()}
          onTypeChange={handleTypeChange}
          onCategoryChange={handleCategoryChange}
          onSecurityChange={handleSecurityChange}
        />
        <div class="flex-1 overflow-y-auto p-6">
          <Show
            when={results()}
            fallback={
              <div class="flex h-full items-center justify-center text-[var(--native-muted)]">
                Loading...
              </div>
            }
          >
            {(data) => (
              <>
                <div class="mb-4 text-sm text-[var(--native-muted)]">
                  {data().total} results
                  {searchParams.q && ` for "${searchParams.q}"`}
                </div>
                <div class="space-y-3">
                  <For each={data().items}>
                    {(item) => (
                      <CapabilityListItem
                        item={item}
                        onClick={() => navigate(`/store/${item.slug}`)}
                      />
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Update store index**

Add to `src/pages/store/index.ts`:

```tsx
export { default as StoreSearch } from "./pages/search"
```

- [ ] **Step 3: Add search route**

In `src/routes.tsx`, add lazy import:

```tsx
const StoreSearch = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreSearch })))
```

In the `/store` route config, add search route:

```tsx
{
  path: "/store",
  component: StoreLayout,
  auth: true,
  children: [
    { path: "/", component: StoreHome },
    { path: "/search", component: StoreSearch },
    { path: "/manager", component: StoreManager },
  ],
},
```

- [ ] **Step 4: Test search page**

Navigate to: `http://localhost:3000/store/search?q=code`
Expected: See search results page with filters on left and results on right

- [ ] **Step 5: Commit**

```bash
git add src/pages/store/pages/search.tsx src/pages/store/index.ts src/routes.tsx
git commit -m "feat(store): add search page with filters"
```

---

### Task 14: Create Detail Page

**Files:**
- Create: `src/pages/store/pages/detail.tsx`
- Modify: `src/routes.tsx` (add detail route)

- [ ] **Step 1: Create detail page**

```tsx
// src/pages/store/pages/detail.tsx
import { createResource, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { itemApi, userApi } from "../lib/api"
import TopNav from "../components/top-nav"
import ItemDetailContent from "../components/item-detail-content"
import { Icon } from "@opencode-ai/ui/icon"

export default function DetailPage() {
  const language = useLanguage()
  const navigate = useNavigate()
  const params = useParams()

  const [item] = createResource(
    () => params.slug,
    (slug) => itemApi.list({ search: slug, page: 1, pageSize: 1 }).then((r) => r.items[0])
  )

  return (
    <>
      <TopNav />
      <div class="mx-auto max-w-7xl p-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          class="mb-4 flex items-center gap-2 text-sm text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
        >
          <Icon name="chevron-left" class="size-4" />
          <span>{language.t("store.browse.back")}</span>
        </button>

        <Show
          when={item()}
          fallback={
            <div class="flex h-96 items-center justify-center text-[var(--native-muted)]">
              Loading...
            </div>
          }
        >
          {(data) => (
            <ItemDetailContent
              itemId={data().id}
              favorited={false}
              favoriteCount={data().favoriteCount ?? 0}
              previewCount={data().previewCount ?? 0}
              installCount={data().installCount ?? 0}
              isAuthenticated={true}
            />
          )}
        </Show>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Update store index**

Add to `src/pages/store/index.ts`:

```tsx
export { default as StoreDetail } from "./pages/detail"
```

- [ ] **Step 3: Add detail route**

In `src/routes.tsx`, add lazy import:

```tsx
const StoreDetail = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreDetail })))
```

In the `/store` route config, add detail route (must be AFTER `/search` to avoid conflict):

```tsx
{
  path: "/store",
  component: StoreLayout,
  auth: true,
  children: [
    { path: "/", component: StoreHome },
    { path: "/search", component: StoreSearch },
    { path: "/:slug", component: StoreDetail },
    { path: "/manager", component: StoreManager },
  ],
},
```

- [ ] **Step 4: Add i18n key**

In `src/i18n/en.ts`:

```tsx
"store.browse.back": "Back",
```

In `src/i18n/zh.ts`:

```tsx
"store.browse.back": "返回",
```

- [ ] **Step 5: Test detail page**

Click on any card in home page
Expected: Navigate to `/store/:slug` and see detail page

- [ ] **Step 6: Commit**

```bash
git add src/pages/store/pages/detail.tsx src/pages/store/index.ts src/routes.tsx src/i18n/en.ts src/i18n/zh.ts
git commit -m "feat(store): add detail page"
```

---

## Completion Checklist

- [ ] All Phase 1 tasks complete (architecture & routing)
- [ ] All Phase 2 tasks complete (browse frontend)
- [ ] Home page renders with hero search, type tabs, featured carousel, category grid
- [ ] Search page works with filters
- [ ] Detail page works and shows item details
- [ ] /store-admin routes exist and show placeholder pages
- [ ] All components use new design system (colors, spacing, typography)
- [ ] Responsive layout works on mobile/tablet/desktop
- [ ] No TypeScript errors
- [ ] Demo mode still works with mock data

---

## Next Steps

After completing Phase 1 & 2, continue with:

**Phase 3: Admin Frontend**
- Task 15: Implement admin sidebar with navigation
- Task 16: Build dashboard page with stats cards
- Task 17: Build my-capabilities page with admin table
- Task 18: Add bulk operations toolbar
- Task 19: Implement favorites/received/sent pages
- Task 20: Add admin-only pages (review queue, space manager)

**Phase 4: Polish & Integration**
- Task 21: Add animations and transitions
- Task 22: Implement responsive mobile layouts
- Task 23: Add loading states and error handling
- Task 24: Accessibility audit
- Task 25: Performance optimization
