import type { IconProps } from "@opencode-ai/ui/icon"
import type { LocalIconName } from "@/components/local-icon"

export interface CollaborationMenuItem {
  code: string
  href: string
  labelKey: string
  icon?: IconProps["name"]
  localIcon?: LocalIconName
  exact?: boolean
}

export const ALL_COLLABORATION_MENUS: readonly CollaborationMenuItem[] = [
  { code: "collaboration.issues", href: "/collaboration/issues", labelKey: "collaboration.nav.issues", icon: "task" as IconProps["name"] },
  { code: "collaboration.projects", href: "/collaboration/projects", labelKey: "collaboration.nav.projects", icon: "folder" as IconProps["name"] },
  { code: "collaboration.squads", href: "/collaboration/squads", labelKey: "collaboration.nav.squads", icon: "users" as IconProps["name"] },
] as const
