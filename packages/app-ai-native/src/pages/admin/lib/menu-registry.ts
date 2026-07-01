import type { IconProps } from "@opencode-ai/ui/icon"

export interface AdminMenuItem {
  code: string
  href: string
  labelKey: string
  icon: IconProps["name"]
  exact?: boolean
}

// 成员管理（M1）+ 权限管理（M2）+ Plugin 下发管理（M3）+ 大客户配置（M4）+ 运营（M5）+ 内容管理（M6）+ 批量导入（M7）。后续模块按此结构追加即可。
export const ALL_ADMIN_MENUS: readonly AdminMenuItem[] = [
  { code: "admin.members", href: "/admin/members", labelKey: "admin.nav.members", icon: "bullet-list" as IconProps["name"] },
  { code: "admin.permissions", href: "/admin/permissions", labelKey: "admin.nav.permissions", icon: "shield-2" as IconProps["name"] },
  { code: "admin.distributions", href: "/admin/distributions", labelKey: "admin.nav.distributions", icon: "square-arrow-top-right" as IconProps["name"] },
  { code: "admin.content", href: "/admin/content", labelKey: "admin.nav.content", icon: "file-text" as IconProps["name"] },
  { code: "admin.import", href: "/admin/import", labelKey: "admin.nav.import", icon: "cloud-upload" as IconProps["name"] },
  { code: "admin.enterprise", href: "/admin/enterprise", labelKey: "admin.nav.enterprise", icon: "store" as IconProps["name"] },
  { code: "admin.ops", href: "/admin/ops", labelKey: "admin.nav.ops", icon: "settings-gear" as IconProps["name"] },
] as const
