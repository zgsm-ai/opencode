import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import AvatarDisplay from "@/components/avatar-display"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"
import {
  adminDeptApi,
  adminPermissionApi,
  adminUserApi,
  type AdminDept,
  type AdminDeptMember,
  type AdminUser,
  type AdminUserProfile,
  type AdminUserStatus,
  type SystemRole,
} from "@/pages/store/lib/api"
import { sx, st } from "../lib/styles"

const STATUS_FILTERS = ["", "active", "disabled", "banned"] as const
const SYSTEM_ROLES: readonly SystemRole[] = ["platform_admin", "business_admin"] as const
const PAGE_SIZE = 20
type Tab = "members" | "organizations"

// dept-sync proxy responds 503 with a stable code when the department service is
// not configured/unreachable; the org tab keys on this to show a notice instead
// of a generic error toast.
const DEPT_UNAVAILABLE_CODE = "dept_sync_unavailable"

export default function AdminMembers() {
  const language = useLanguage()
  const dialog = useDialog()
  const auth = useAuth()

  const [state, setState] = createStore<{
    tab: Tab
    users: AdminUser[]
    total: number
    loading: boolean
    status: string
    search: string
    debouncedSearch: string
    page: number
    // Department-tree (org) tab. `tree` holds only the top-level roots; deeper
    // levels are lazy-loaded per node (see childrenOf/nodeState below).
    tree: AdminDept[]
    treeLoading: boolean
    treeLoaded: boolean
    treeUnavailable: boolean
    selectedDeptId: string
    selectedDeptName: string
    deptMembers: AdminDeptMember[]
    deptMembersLoading: boolean
  }>({
    tab: "members",
    users: [],
    total: 0,
    loading: true,
    status: "",
    search: "",
    debouncedSearch: "",
    page: 1,
    tree: [],
    treeLoading: false,
    treeLoaded: false,
    treeUnavailable: false,
    selectedDeptId: "",
    selectedDeptName: "",
    deptMembers: [],
    deptMembersLoading: false,
  })

  // Lazy department tree: `state.tree` holds the top-level roots, which are
  // auto-expanded on load so the first level shows by default; deeper levels are
  // fetched on first expand and cached in `childrenOf`, keyed by dept id.
  // `nodeState` tracks per-node expand/loading/loaded/error so re-collapsing then
  // re-expanding never refetches.
  const [childrenOf, setChildrenOf] = createStore<Record<string, AdminDept[]>>({})
  const [nodeState, setNodeState] = createStore<
    Record<string, { expanded?: boolean; loading?: boolean; loaded?: boolean; error?: boolean }>
  >({})
  const isExpanded = (id: string) => nodeState[id]?.expanded === true

  // Fetch (or refetch, on retry) one node's direct children. On completion we
  // merge only load flags (createStore shallow-merges), NOT `expanded`, so if the
  // user collapsed the node mid-load their intent is preserved (no surprise reopen).
  async function loadChildren(node: AdminDept) {
    const id = node.deptId
    setNodeState(id, { expanded: true, loading: true, error: false })
    try {
      const res = await adminDeptApi.children(id)
      setChildrenOf(id, res.departments ?? [])
      setNodeState(id, { loading: false, loaded: true, error: false })
    } catch (err) {
      setNodeState(id, { loading: false, loaded: false, error: true })
      if (isDeptUnavailable(err)) {
        setState("treeUnavailable", true)
      } else {
        showToast({
          variant: "error",
          title: language.t("admin.members.org.childrenFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  // Toggle a node: collapse (keep cache), or open it. Opening reuses cached children
  // (loaded) or an already in-flight fetch (loading) without starting a duplicate
  // request; only a never-loaded node kicks off loadChildren.
  function toggleExpand(node: AdminDept) {
    const st = nodeState[node.deptId]
    if (st?.expanded) {
      setNodeState(node.deptId, "expanded", false)
      return
    }
    if (st?.loaded || st?.loading) {
      setNodeState(node.deptId, "expanded", true)
      return
    }
    void loadChildren(node)
  }

  // Per-row status-action loading guard.
  const [actionLoading, setActionLoading] = createStore<Record<string, boolean>>({})

  // System-role grant/revoke guard (per role), scoped to the open detail drawer.
  const [roleSaving, setRoleSaving] = createSignal<SystemRole | null>(null)

  // Detail drawer state.
  const [detail, setDetail] = createStore<{
    open: boolean
    user: AdminUser | null
    profile: AdminUserProfile | null
    loading: boolean
  }>({ open: false, user: null, profile: null, loading: false })

  let searchTimer: ReturnType<typeof setTimeout>

  const totalPages = createMemo(() => Math.max(1, Math.ceil(state.total / PAGE_SIZE)))
  const currentSubject = () => auth.user()?.subjectId ?? auth.user()?.sub ?? ""

  async function load() {
    setState("loading", true)
    try {
      const res = await adminUserApi.list({
        search: state.debouncedSearch || undefined,
        status: state.status || undefined,
        page: state.page,
        pageSize: PAGE_SIZE,
      })
      setState("users", res.users ?? [])
      setState("total", res.total ?? 0)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.members.toast.loadFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setState("loading", false)
    }
  }

  // Distinguish "department service unavailable" (503 dept_sync_unavailable) from
  // a real error: the former renders an inline notice, the latter toasts.
  function isDeptUnavailable(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err)
    return msg.includes(DEPT_UNAVAILABLE_CODE) || msg.includes("department service")
  }

  async function loadTree() {
    setState("treeLoading", true)
    setState("treeUnavailable", false)
    try {
      // Load the top-level roots, then auto-expand them so the first level (each
      // root's direct children) shows by default. Deeper levels stay lazy — they
      // load on expand. loadChildren swallows its own errors (per-node retry row).
      const res = await adminDeptApi.children()
      const roots = res.departments ?? []
      setState("tree", roots)
      setState("treeLoaded", true)
      await Promise.all(roots.filter((r) => r.childDeptCount > 0).map((r) => loadChildren(r)))
    } catch (err) {
      if (isDeptUnavailable(err)) {
        setState("treeUnavailable", true)
        setState("treeLoaded", true)
      } else {
        showToast({
          variant: "error",
          title: language.t("admin.members.toast.treeFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      setState("treeLoading", false)
    }
  }

  async function selectDept(d: AdminDept) {
    setState("selectedDeptId", d.deptId)
    setState("selectedDeptName", d.deptName)
    setState("deptMembers", [])
    setState("deptMembersLoading", true)
    try {
      const res = await adminDeptApi.deptUsers(d.deptId)
      // Guard against a stale response if the user clicked another dept meanwhile.
      if (state.selectedDeptId !== d.deptId) return
      setState("deptMembers", res.members ?? [])
    } catch (err) {
      if (isDeptUnavailable(err)) {
        setState("treeUnavailable", true)
      } else {
        showToast({
          variant: "error",
          title: language.t("admin.members.toast.deptUsersFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      if (state.selectedDeptId === d.deptId) setState("deptMembersLoading", false)
    }
  }

  onMount(() => void load())

  function switchTab(tab: Tab) {
    setState("tab", tab)
    if (tab === "organizations" && !state.treeLoaded) void loadTree()
  }

  function setStatusFilter(value: string) {
    setState("status", value)
    setState("page", 1)
    void load()
  }

  function onSearchInput(value: string) {
    setState("search", value)
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      setState("debouncedSearch", value.trim())
      setState("page", 1)
      void load()
    }, 300)
  }

  function gotoPage(p: number) {
    if (p < 1 || p > totalPages()) return
    setState("page", p)
    void load()
  }

  async function openDetail(u: AdminUser) {
    setDetail({ open: true, user: u, profile: null, loading: true })
    try {
      const res = await adminUserApi.getProfile(u.subject_id)
      setDetail("user", res.user)
      setDetail("profile", res.profile)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.members.toast.profileFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setDetail("loading", false)
    }
  }

  // Open the member detail drawer from a linked dept-sync member: build a minimal
  // AdminUser from the linked local user, then load the full profile by subject id.
  function openLinkedMemberDetail(member: AdminDeptMember) {
    if (!member.linked) return
    const l = member.linked
    void openDetail({
      subject_id: l.subjectId,
      universalId: member.universalId,
      username: member.username,
      displayName: l.displayName,
      email: l.email,
      avatarUrl: l.avatarUrl,
      organization: "",
      status: l.status,
      roles: l.roles,
      lastLoginAt: null,
      createdAt: "",
    })
  }

  async function applyStatus(u: AdminUser, status: AdminUserStatus) {
    setActionLoading(u.subject_id, true)
    try {
      await adminUserApi.setStatus(u.subject_id, status)
      setState("users", (x) => x.subject_id === u.subject_id, "status", status)
      if (detail.user?.subject_id === u.subject_id) setDetail("user", (d) => (d ? { ...d, status } : d))
      showToast({ variant: "success", title: language.t("admin.members.toast.statusUpdated") })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.members.toast.statusFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setActionLoading(u.subject_id, false)
    }
  }

  // Banning/disabling are destructive — confirm first with a warning-styled dialog.
  const confirmStatus = (u: AdminUser, status: AdminUserStatus) =>
    dialog.show(() => (
      <ConfirmDialog
        title={language.t(`admin.members.confirm.${status}.title` as "admin.members.confirm.banned.title")}
        description={language.t(`admin.members.confirm.${status}.description` as "admin.members.confirm.banned.description", {
          name: displayName(u),
        })}
        confirm={language.t(`admin.members.actions.${status}` as "admin.members.actions.banned")}
        variant="danger"
        onConfirm={() => applyStatus(u, status)}
      />
    ))

  // ── System-role management (merged from the former Permissions "Role Grants" tab) ──
  // Grant immediately; revoke goes through a confirm dialog. Both update the open
  // drawer's roles in place so the UI reflects the change without a reload.
  const detailHasRole = (role: SystemRole) => (detail.user?.roles ?? []).includes(role)

  async function grantRole(role: SystemRole) {
    const u = detail.user
    if (!u || roleSaving()) return
    setRoleSaving(role)
    try {
      await adminPermissionApi.grantRole(u.subject_id, role)
      setDetail("user", (d) => (d ? { ...d, roles: [...d.roles, role] } : d))
      setState("users", (x) => x.subject_id === u.subject_id, "roles", (r) => [...r, role])
      showToast({ variant: "success", title: language.t("admin.members.roleMgmt.toast.granted") })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.members.roleMgmt.toast.actionFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setRoleSaving(null)
    }
  }

  async function revokeRole(role: SystemRole) {
    const u = detail.user
    if (!u || roleSaving()) return
    setRoleSaving(role)
    try {
      await adminPermissionApi.revokeRole(u.subject_id, role)
      setDetail("user", (d) => (d ? { ...d, roles: d.roles.filter((r) => r !== role) } : d))
      setState("users", (x) => x.subject_id === u.subject_id, "roles", (r) => r.filter((x) => x !== role))
      showToast({ variant: "success", title: language.t("admin.members.roleMgmt.toast.revoked") })
    } catch (err) {
      // Backend rejects revoking the last platform_admin with a 400; surface its message.
      showToast({
        variant: "error",
        title: language.t("admin.members.roleMgmt.toast.actionFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setRoleSaving(null)
    }
  }

  const confirmRevokeRole = (role: SystemRole) =>
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("admin.members.roleMgmt.confirm.title")}
        description={language.t("admin.members.roleMgmt.confirm.description", { role: roleLabel(role) })}
        confirm={language.t("admin.members.roleMgmt.revoke")}
        variant="danger"
        onConfirm={() => void revokeRole(role)}
      />
    ))

  const displayName = (u: AdminUser) => u.displayName || u.username || u.subject_id

  const statusLabel = (s: string) =>
    language.t(`admin.members.status.${s || "active"}` as "admin.members.status.active")

  // Semantic status colors via native tokens (active=success, banned=error).
  const statusStyle = (s: string) => {
    switch (s) {
      case "banned":
        return "bg-[color:color-mix(in_oklab,var(--native-error)_14%,transparent)] text-[var(--native-error)]"
      case "disabled":
        return "bg-[color:color-mix(in_oklab,var(--native-muted)_18%,transparent)] text-[var(--native-muted)]"
      default:
        return "bg-[color:color-mix(in_oklab,var(--native-success,#16a34a)_14%,transparent)] text-[var(--native-success,#16a34a)]"
    }
  }

  const roleLabel = (role: string) =>
    language.t(`admin.members.roles.${role}` as "admin.members.roles.platform_admin", {}) || role

  const fmtDate = (iso?: string | null) => {
    if (!iso) return "—"
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(language.locale() === "zh" ? "zh-CN" : "en-US")
  }

  // Recursive department-tree node. Whether a node can expand is decided by
  // childDeptCount (no need to pre-load a level); its direct children are fetched
  // lazily on first expand and rendered from childrenOf, indented one level deeper.
  function DeptTreeNode(props: { node: AdminDept; depth: number }) {
    const node = () => props.node
    const hasChildren = () => node().childDeptCount > 0
    const expanded = () => isExpanded(node().deptId)
    const nstate = () => nodeState[node().deptId]
    const selected = () => state.selectedDeptId === node().deptId
    return (
      <li role="treeitem" aria-expanded={hasChildren() ? expanded() : undefined} aria-selected={selected()}>
        <div
          class={`flex items-center gap-1 rounded-[var(--native-radius-sm)] transition-colors ${
            selected()
              ? "bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)]"
              : "hover:bg-[color:color-mix(in_oklab,var(--native-border)_22%,transparent)]"
          }`}
          style={{ "padding-left": `${props.depth * 16}px` }}
        >
          <Show
            when={hasChildren()}
            fallback={<span class="inline-block w-5 shrink-0" aria-hidden="true" />}
          >
            <button
              type="button"
              class="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--native-primary)]"
              aria-label={
                expanded() ? language.t("admin.members.org.collapse") : language.t("admin.members.org.expand")
              }
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(node())
              }}
            >
              <Show
                when={nstate()?.loading}
                fallback={<Icon name={expanded() ? "chevron-down" : "chevron-right"} size="small" />}
              >
                <span
                  class="h-3 w-3 animate-spin rounded-full border border-[var(--native-muted)] border-t-transparent"
                  aria-hidden="true"
                />
              </Show>
            </button>
          </Show>
          <button
            type="button"
            class={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 pr-2 text-left text-[0.8125rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--native-primary)] ${
              selected() ? "font-semibold text-[var(--native-primary)]" : "text-[var(--native-foreground)]"
            }`}
            onClick={() => void selectDept(node())}
          >
            <Icon name="folder" size="small" class="shrink-0 text-[var(--native-muted)]" />
            <span class="truncate">{node().deptName}</span>
          </button>
        </div>
        <Show when={hasChildren() && expanded()}>
          <ul role="group">
            <Show when={nstate()?.error}>
              <li
                class="flex items-center gap-2 py-1 pr-2 text-[0.75rem] text-[var(--native-muted)]"
                style={{ "padding-left": `${(props.depth + 1) * 16 + 20}px` }}
              >
                <span>{language.t("admin.members.org.childrenFailed")}</span>
                <button
                  type="button"
                  class="cursor-pointer text-[var(--native-primary)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--native-primary)]"
                  onClick={() => void loadChildren(node())}
                >
                  {language.t("admin.members.org.retry")}
                </button>
              </li>
            </Show>
            <For each={childrenOf[node().deptId] ?? []}>
              {(child) => <DeptTreeNode node={child} depth={props.depth + 1} />}
            </For>
          </ul>
        </Show>
      </li>
    )
  }

  // Semantic status pill class shared by member rows and the dept-member list.
  const memberStatusStyle = (s: string) => statusStyle(s)

  return (
    <section class={sx.section}>
      <div class={sx.head}>
        <div>
          <h1 class={sx.title}>{language.t("admin.members.title")}</h1>
          <p class={sx.sub}>{language.t("admin.members.subtitle")}</p>
        </div>
      </div>

      {/* Tabs: members / organizations */}
      <div class="mb-3 flex flex-wrap gap-1" role="tablist" aria-label={language.t("admin.members.title")}>
        <button
          type="button"
          role="tab"
          aria-selected={state.tab === "members"}
          class={st.filter(state.tab === "members")}
          onClick={() => switchTab("members")}
        >
          {language.t("admin.members.tabs.members")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.tab === "organizations"}
          class={st.filter(state.tab === "organizations")}
          onClick={() => switchTab("organizations")}
        >
          {language.t("admin.members.tabs.organizations")}
        </button>
      </div>

      <Show when={state.tab === "members"}>
        {/* Filters */}
        <div class="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap gap-1" aria-label={language.t("admin.members.filter.statusGroup")}>
            <For each={STATUS_FILTERS}>
              {(s) => (
                <button
                  type="button"
                  class={st.filter(state.status === s)}
                  aria-pressed={state.status === s}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "" ? language.t("admin.members.filter.allStatus") : statusLabel(s)}
                </button>
              )}
            </For>
          </div>
          <div class={sx.searchWrap}>
            <svg class={sx.searchIcon} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <g transform="scale(0.833333)">
                <path d="m21 21-4.34-4.34" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="11" cy="11" r="8" stroke="currentColor" />
              </g>
            </svg>
            <input
              class={sx.search}
              placeholder={language.t("admin.members.searchPlaceholder")}
              value={state.search}
              aria-label={language.t("admin.members.searchPlaceholder")}
              onInput={(e) => onSearchInput(e.currentTarget.value)}
            />
          </div>
        </div>

        {/* Members table */}
        <div class={sx.tableShell}>
          <Show when={state.loading}>
            <div class={sx.overlay}>
              <div class={sx.spinner} />
            </div>
          </Show>

          <table class={sx.dtStatic}>
            <thead>
              <tr>
                <th>{language.t("admin.members.columns.user")}</th>
                <th class="w-52">{language.t("admin.members.columns.email")}</th>
                <th class="w-36">{language.t("admin.members.columns.organization")}</th>
                <th class="w-24">{language.t("admin.members.columns.status")}</th>
                <th class="w-40">{language.t("admin.members.columns.roles")}</th>
                <th class="w-56 text-right">{language.t("admin.members.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={state.users}>
                {(u) => {
                  const self = () => u.subject_id === currentSubject()
                  const selfHintId = `member-self-hint-${u.subject_id}`
                  return (
                    <tr>
                      <td>
                        <button
                          type="button"
                          class="flex cursor-pointer items-center gap-2.5 text-left"
                          onClick={() => void openDetail(u)}
                        >
                          <AvatarDisplay avatarUrl={u.avatarUrl} username={displayName(u)} size={28} radius={6} />
                          <span class="min-w-0">
                            <span class="block truncate font-semibold text-[var(--native-foreground)] hover:underline">
                              {displayName(u)}
                            </span>
                            <span class="block truncate text-[12px] text-[var(--native-muted)]">{u.username}</span>
                          </span>
                        </button>
                      </td>
                      <td class="truncate text-[var(--native-muted)]">{u.email || "—"}</td>
                      <td class="truncate text-[var(--native-muted)]">{u.organization || "—"}</td>
                      <td>
                        <span class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusStyle(u.status)}`}>
                          {statusLabel(u.status)}
                        </span>
                      </td>
                      <td class="text-[var(--native-muted)]">
                        <Show when={u.roles.length > 0} fallback={<span>—</span>}>
                          <span class="text-[12px]">{u.roles.map(roleLabel).join(", ")}</span>
                        </Show>
                      </td>
                      <td class="text-right">
                        <div class="flex flex-col items-end gap-1">
                          <div class="flex items-center justify-end gap-3">
                            <Show when={u.status !== "active"}>
                              <button
                                type="button"
                                class="cursor-pointer text-[var(--native-primary)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={actionLoading[u.subject_id]}
                                onClick={() => void applyStatus(u, "active")}
                              >
                                {language.t("admin.members.actions.active")}
                              </button>
                            </Show>
                            <Show when={u.status === "active"}>
                              <button
                                type="button"
                                class="cursor-pointer text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={actionLoading[u.subject_id] || self()}
                                aria-describedby={self() ? selfHintId : undefined}
                                onClick={() => confirmStatus(u, "disabled")}
                              >
                                {language.t("admin.members.actions.disabled")}
                              </button>
                            </Show>
                            <Show when={u.status !== "banned"}>
                              <button
                                type="button"
                                class="cursor-pointer text-[var(--native-error)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={actionLoading[u.subject_id] || self()}
                                aria-describedby={self() ? selfHintId : undefined}
                                onClick={() => confirmStatus(u, "banned")}
                              >
                                {language.t("admin.members.actions.banned")}
                              </button>
                            </Show>
                            <button
                              type="button"
                              class="cursor-pointer text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] hover:underline"
                              onClick={() => void openDetail(u)}
                            >
                              {language.t("admin.members.actions.detail")}
                            </button>
                          </div>
                          <Show when={self()}>
                            <p id={selfHintId} class="text-[11px] text-[var(--native-muted)]">
                              {language.t("admin.members.selfHint")}
                            </p>
                          </Show>
                        </div>
                      </td>
                    </tr>
                  )
                }}
              </For>
            </tbody>
          </table>

          <Show when={!state.loading && state.users.length === 0}>
            <div class={sx.state}>{language.t("admin.members.empty")}</div>
          </Show>
        </div>

        {/* Pagination */}
        <Show when={state.total > PAGE_SIZE}>
          <div class={sx.pager}>
            <span class={sx.pagerSum}>
              {language.t("admin.members.pagination.summary", {
                page: String(state.page),
                total: String(totalPages()),
                count: String(state.total),
              })}
            </span>
            <div class={sx.pagerActs}>
              <button
                type="button"
                class={sx.page}
                disabled={state.page <= 1}
                aria-label={language.t("admin.members.pagination.prev")}
                onClick={() => gotoPage(state.page - 1)}
              >
                <Icon name="chevron-left" size="small" />
              </button>
              <button
                type="button"
                class={sx.page}
                disabled={state.page >= totalPages()}
                aria-label={language.t("admin.members.pagination.next")}
                onClick={() => gotoPage(state.page + 1)}
              >
                <Icon name="chevron-right" size="small" />
              </button>
            </div>
          </div>
        </Show>
      </Show>

      {/* Organizations tab — real department tree (via dept-sync) */}
      <Show when={state.tab === "organizations"}>
        {/* dept-sync not configured / unreachable → inline notice (no crash) */}
        <Show when={state.treeUnavailable}>
          <div class="flex flex-col items-center gap-3 rounded-[var(--native-radius-lg)] border border-dashed border-[color:color-mix(in_oklab,var(--native-border)_55%,transparent)] px-6 py-12 text-center">
            <Icon name="warning" size="large" class="text-[var(--native-muted)]" />
            <div class="text-[0.9375rem] font-semibold text-[var(--native-foreground)]">
              {language.t("admin.members.org.unavailableTitle")}
            </div>
            <p class="max-w-md text-[0.8125rem] leading-relaxed text-[var(--native-muted)]">
              {language.t("admin.members.org.unavailableHint")}
            </p>
            <button
              type="button"
              class="cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-primary)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_10%,transparent)]"
              onClick={() => void loadTree()}
            >
              {language.t("admin.members.org.retry")}
            </button>
          </div>
        </Show>

        <Show when={!state.treeUnavailable}>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,440px)_1fr]">
            {/* Left: department tree */}
            <div class="relative min-h-[480px] rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-background-base p-2">
              <div class="mb-1.5 px-1 pt-0.5">
                <div class="text-[0.8125rem] font-semibold text-[var(--native-foreground)]">
                  {language.t("admin.members.org.treeTitle")}
                </div>
                <div class="text-[11px] text-[var(--native-muted)]">{language.t("admin.members.org.treeSubtitle")}</div>
              </div>

              <Show when={state.treeLoading}>
                <div class={sx.overlay}>
                  <div class={sx.spinner} />
                </div>
              </Show>

              <Show
                when={!state.treeLoading && state.tree.length === 0}
                fallback={
                  <ul role="tree" aria-label={language.t("admin.members.org.treeTitle")} class="thin-scrollbar max-h-[72vh] min-h-[440px] overflow-y-auto">
                    <For each={state.tree}>{(node) => <DeptTreeNode node={node} depth={0} />}</For>
                  </ul>
                }
              >
                <div class={sx.state}>{language.t("admin.members.org.treeEmpty")}</div>
              </Show>
            </div>

            {/* Right: selected department members */}
            <div class="relative min-h-[480px] rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-background-base">
              <Show
                when={state.selectedDeptId}
                fallback={<div class={sx.state}>{language.t("admin.members.org.selectDept")}</div>}
              >
                <div class="flex items-center justify-between gap-2 border-b border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] px-3 py-2.5">
                  <div class="min-w-0">
                    <div class="truncate text-[0.875rem] font-semibold text-[var(--native-foreground)]">
                      {state.selectedDeptName}
                    </div>
                    <div class="text-[11px] text-[var(--native-muted)]">
                      {language.t("admin.members.org.memberCount", { count: String(state.deptMembers.length) })}
                    </div>
                  </div>
                </div>

                <div class="relative">
                  <Show when={state.deptMembersLoading}>
                    <div class={sx.overlay}>
                      <div class={sx.spinner} />
                    </div>
                  </Show>

                  <table class={sx.dtStatic}>
                    <thead>
                      <tr>
                        <th>{language.t("admin.members.columns.user")}</th>
                        <th class="w-36">{language.t("admin.members.org.position")}</th>
                        <th class="w-24">{language.t("admin.members.columns.status")}</th>
                        <th class="w-40">{language.t("admin.members.columns.roles")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={state.deptMembers}>
                        {(member) => (
                          <tr>
                            <td>
                              <Show
                                when={member.registered && member.linked}
                                fallback={
                                  <div class="flex items-center gap-2.5">
                                    <AvatarDisplay avatarUrl="" username={member.username} size={28} radius={6} />
                                    <span class="min-w-0">
                                      <span class="block truncate font-semibold text-[var(--native-foreground)]">
                                        {member.username}
                                      </span>
                                      <span class="block truncate text-[11px] text-[var(--native-muted)]">
                                        {language.t("admin.members.org.unregistered")}
                                      </span>
                                    </span>
                                  </div>
                                }
                              >
                                <button
                                  type="button"
                                  class="flex cursor-pointer items-center gap-2.5 text-left"
                                  onClick={() => openLinkedMemberDetail(member)}
                                >
                                  <AvatarDisplay
                                    avatarUrl={member.linked!.avatarUrl}
                                    username={member.linked!.displayName || member.username}
                                    size={28}
                                    radius={6}
                                  />
                                  <span class="min-w-0">
                                    <span class="block truncate font-semibold text-[var(--native-foreground)] hover:underline">
                                      {member.linked!.displayName || member.username}
                                    </span>
                                    <span class="block truncate text-[11px] text-[var(--native-muted)]">
                                      {member.linked!.email || member.username}
                                    </span>
                                  </span>
                                </button>
                              </Show>
                            </td>
                            <td class="truncate text-[var(--native-muted)]">
                              {member.position || "—"}
                              <Show when={member.isMain}>
                                <span class="ml-1.5 inline-flex items-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--native-primary)]">
                                  {language.t("admin.members.org.mainDept")}
                                </span>
                              </Show>
                            </td>
                            <td>
                              <Show when={member.linked} fallback={<span class="text-[var(--native-muted)]">—</span>}>
                                <span
                                  class={`inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${memberStatusStyle(member.linked!.status)}`}
                                >
                                  {statusLabel(member.linked!.status)}
                                </span>
                              </Show>
                            </td>
                            <td class="text-[var(--native-muted)]">
                              <Show when={member.linked && member.linked.roles.length > 0} fallback={<span>—</span>}>
                                <span class="text-[12px]">{member.linked!.roles.map(roleLabel).join(", ")}</span>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>

                  <Show when={!state.deptMembersLoading && state.deptMembers.length === 0}>
                    <div class={sx.state}>{language.t("admin.members.org.membersEmpty")}</div>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </Show>

      {/* Detail drawer */}
      <Sheet open={detail.open} onOpenChange={(o) => setDetail("open", o)}>
        <SheetContent position="right" class="w-full max-w-[440px]">
          <SheetHeader>
            <SheetTitle>{detail.user ? displayName(detail.user) : ""}</SheetTitle>
            <SheetDescription>{language.t("admin.members.detail.subtitle")}</SheetDescription>
          </SheetHeader>

          <Show when={detail.user}>
            {(u) => (
              <div class="flex flex-col gap-5 px-1 pt-2">
                <div class="flex items-center gap-3">
                  <AvatarDisplay avatarUrl={u().avatarUrl} username={displayName(u())} size={48} radius={8} />
                  <div class="min-w-0">
                    <div class="truncate font-semibold text-[var(--native-foreground)]">{displayName(u())}</div>
                    <div class="truncate text-[0.8125rem] text-[var(--native-muted)]">{u().email || u().username}</div>
                    <span class={`mt-1 inline-flex items-center rounded-[var(--native-radius-sm)] px-1.5 py-0.5 text-[11px] font-medium ${statusStyle(u().status)}`}>
                      {statusLabel(u().status)}
                    </span>
                  </div>
                </div>

                {/* Meta */}
                <div class="grid grid-cols-2 gap-3 text-[0.8125rem]">
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.members.columns.organization")}
                    </div>
                    <div class="mt-0.5 truncate text-[var(--native-foreground)]">{u().organization || "—"}</div>
                  </div>
                  <div>
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.members.detail.lastLogin")}
                    </div>
                    <div class="mt-0.5 text-[var(--native-foreground)]">{fmtDate(u().lastLoginAt)}</div>
                  </div>
                </div>

                {/* System role management (grant / revoke) */}
                <div class="border-t border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] pt-4">
                  <div class="mb-2 flex items-center justify-between">
                    <div class="text-[12px] uppercase tracking-[0.06em] text-[var(--native-muted)]">
                      {language.t("admin.members.roleMgmt.title")}
                    </div>
                  </div>
                  <p class="mb-3 text-[12px] leading-relaxed text-[var(--native-muted)]">
                    {language.t("admin.members.roleMgmt.help")}
                  </p>
                  <div class="flex flex-col gap-1.5">
                    <For each={SYSTEM_ROLES}>
                      {(role) => {
                        const has = () => detailHasRole(role)
                        const busy = () => roleSaving() === role
                        return (
                          <div class="flex items-center justify-between gap-3 rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] px-3 py-2">
                            <div class="min-w-0">
                              <div class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
                                {roleLabel(role)}
                              </div>
                              <div class="text-[12px] leading-relaxed text-[var(--native-muted)]">
                                {language.t(`admin.members.roleMgmt.role.${role}.desc` as "admin.members.roleMgmt.role.platform_admin.desc")}
                              </div>
                            </div>
                            <Show
                              when={has()}
                              fallback={
                                <button
                                  type="button"
                                  class="shrink-0 cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-primary)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={busy()}
                                  onClick={() => void grantRole(role)}
                                >
                                  {language.t("admin.members.roleMgmt.grant")}
                                </button>
                              }
                            >
                              <button
                                type="button"
                                class="shrink-0 cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-error)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-error)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={busy()}
                                onClick={() => confirmRevokeRole(role)}
                              >
                                {language.t("admin.members.roleMgmt.revoke")}
                              </button>
                            </Show>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </div>

                {/* Activity profile */}
                <div class="grid grid-cols-3 gap-2">
                  <For
                    each={
                      [
                        { key: "createdItemCount", labelKey: "admin.members.detail.created" },
                        { key: "distributedCount", labelKey: "admin.members.detail.distributed" },
                        { key: "receivedCount", labelKey: "admin.members.detail.received" },
                      ] as const
                    }
                  >
                    {(card) => (
                      <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] px-2 py-2 text-center">
                        <div class="text-[1.1rem] font-extrabold text-[var(--native-foreground)] [font-variant-numeric:tabular-nums]">
                          <Show when={!detail.loading && detail.profile} fallback="—">
                            {detail.profile?.[card.key] ?? 0}
                          </Show>
                        </div>
                        <div class="text-[11px] text-[var(--native-muted)]">{language.t(card.labelKey)}</div>
                      </div>
                    )}
                  </For>
                </div>

                {/* Status actions */}
                <div class="flex flex-wrap gap-2 border-t border-[color:color-mix(in_oklab,var(--native-border)_30%,transparent)] pt-4">
                  <Show when={u().status !== "active"}>
                    <button
                      type="button"
                      class="cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-primary)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-primary)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-primary)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={actionLoading[u().subject_id]}
                      onClick={() => void applyStatus(u(), "active")}
                    >
                      {language.t("admin.members.actions.active")}
                    </button>
                  </Show>
                  <Show when={u().status === "active"}>
                    <button
                      type="button"
                      class="cursor-pointer rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_50%,transparent)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={actionLoading[u().subject_id] || u().subject_id === currentSubject()}
                      onClick={() => confirmStatus(u(), "disabled")}
                    >
                      {language.t("admin.members.actions.disabled")}
                    </button>
                  </Show>
                  <Show when={u().status !== "banned"}>
                    <button
                      type="button"
                      class="cursor-pointer rounded-[var(--native-radius-md)] border border-[var(--native-error)] px-3 py-1.5 text-[0.8125rem] text-[var(--native-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-error)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={actionLoading[u().subject_id] || u().subject_id === currentSubject()}
                      onClick={() => confirmStatus(u(), "banned")}
                    >
                      {language.t("admin.members.actions.banned")}
                    </button>
                  </Show>
                </div>
                <Show when={u().subject_id === currentSubject()}>
                  <p class="-mt-3 text-[12px] text-[var(--native-muted)]">{language.t("admin.members.selfHint")}</p>
                </Show>
              </div>
            )}
          </Show>
        </SheetContent>
      </Sheet>
    </section>
  )
}
