type CapabilityType = "skill" | "subagent" | "command" | "mcp"

interface NavItem {
  type: CapabilityType
  href: string
  label: string
  icon: "sparkles" | "brain" | "console" | "mcp"
  color: string
}

interface Repo {
  repoType: "normal" | "sync"
}

export const NAV_ITEMS: NavItem[] = [
  {
    type: "skill",
    href: "/store",
    label: "store.sidebar.nav.skills",
    icon: "sparkles",
    color: "rgb(234,179,8)",
  },
  {
    type: "subagent",
    href: "/store",
    label: "store.sidebar.nav.subagents",
    icon: "brain",
    color: "rgb(59,130,246)",
  },
  {
    type: "command",
    href: "/store",
    label: "store.sidebar.nav.commands",
    icon: "console",
    color: "rgb(34,197,94)",
  },
  {
    type: "mcp",
    href: "/store",
    label: "store.sidebar.nav.mcpServers",
    icon: "mcp",
    color: "rgb(168,85,247)",
  },
]

export const REPO_CAPABILITY_PRIORITY: Record<string, CapabilityType[]> = {
  normal: ["skill", "subagent", "command", "mcp"],
  sync: ["mcp", "command", "subagent", "skill"],
}

export function navItemsForRepo(repo: Repo | null | undefined) {
  if (!repo) return NAV_ITEMS

  const priority = REPO_CAPABILITY_PRIORITY[repo.repoType] ?? REPO_CAPABILITY_PRIORITY.normal
  return priority.map((type) => NAV_ITEMS.find((item) => item.type === type)).filter((item): item is NavItem => !!item)
}

export function repoItemClass(active: boolean) {
  return `group w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm border cursor-pointer transition-all duration-200 ease-out ${
    active
      ? "bg-surface-base border-border-strong text-text-strong font-medium ring-1 ring-border-strong/30"
      : "border-transparent text-text-weak hover:text-text-strong hover:bg-surface-base/80 hover:border-border-weak-base"
  }`
}

export function capabilityItemClass(active: boolean) {
  return `group relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm border cursor-pointer transition-all duration-200 ease-out ${
    active
      ? "bg-surface-base border-border-weak-base text-text-strong font-medium"
      : "border-transparent text-text-weak hover:text-text-strong hover:bg-surface-base-hover hover:shadow-xs-border-base/50"
  }`
}
