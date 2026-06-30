import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import AvatarDisplay from "@/components/avatar-display"
import { Button } from "@/components/ui/button"
import { For, Show, createMemo, createSignal, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import {
  adminPermissionApi,
  adminGrantApi,
  adminDeptApi,
  userApi,
  type AdminDept,
  type GrantSubjectType,
  type PermissionGrant,
  type ResourcePermission,
  type SearchedUser,
  type SystemRole,
} from "@/pages/store/lib/api"
import { sx, st } from "../lib/styles"

const ROLES: readonly SystemRole[] = ["platform_admin", "business_admin"] as const
// Role granting moved into Member Management (member detail drawer); this page now
// covers the resource matrix, fine-grained grants, and the personal access view.
const TABS = ["matrix", "grants", "mine"] as const
type Tab = (typeof TABS)[number]

const DEPT_UNAVAILABLE_CODE = "dept_sync_unavailable"

// Metrics-dashboard scope permission codes. These MUST match the backend authz
// constants (server/internal/authz/scope.go ScopeAllPermission/ScopeDeptPermission)
// — the grant created here is consumed verbatim by ResolveUserScope. Centralizing
// them as a preset means admins never hand-type these strings.
const SCOPE_ALL_CODE = "kanban.scope.all"
const SCOPE_DEPT_CODE = "kanban.scope.dept"
type ScopePreset = "all" | "dept"

const RESOURCE_LABEL_KEYS = {
  repositories: "admin.permissions.resources.repositories",
  projects: "admin.permissions.resources.projects",
  capabilities: "admin.permissions.resources.capabilities",
  devices: "admin.permissions.resources.devices",
  notifications: "admin.permissions.resources.notifications",
  kanban: "admin.permissions.resources.kanban",
  admin: "admin.permissions.resources.admin",
  "admin.system-roles": "admin.permissions.resources.adminSystemRoles",
  "admin.notification-channels": "admin.permissions.resources.adminNotificationChannels",
  "api.kanban.overview": "admin.permissions.resources.apiKanbanOverview",
  "kanban/admin": "admin.permissions.resources.kanbanAdmin",
  "kanban/reader": "admin.permissions.resources.kanbanReader",
  [SCOPE_ALL_CODE]: "admin.permissions.resources.kanbanScopeAll",
  [SCOPE_DEPT_CODE]: "admin.permissions.resources.kanbanScopeDept",
} as const

// Flatten the nested department tree into depth-tagged rows for an indented picker.
interface FlatDept {
  dept: AdminDept
  depth: number
}
function flattenDepts(nodes: AdminDept[], depth = 0, out: FlatDept[] = []): FlatDept[] {
  for (const n of nodes) {
    out.push({ dept: n, depth })
    if (n.children?.length) flattenDepts(n.children, depth + 1, out)
  }
  return out
}

// Resolve the backend userID for a searched user (same precedence as distribute-dialog).
const userIdOf = (u: SearchedUser) => u.id

export default function AdminPermissions() {
  const language = useLanguage()
  const auth = useAuth()
  const [tab, setTab] = createSignal<Tab>("matrix")

  const roleLabel = (role: SystemRole) =>
    language.t(`admin.permissions.role.${role}` as "admin.permissions.role.platform_admin")
  const resourceLabel = (code: string) => {
    const key = RESOURCE_LABEL_KEYS[code as keyof typeof RESOURCE_LABEL_KEYS]
    return key ? language.t(key as "admin.permissions.resources.repositories") : code
  }
  const resourceTypeLabel = (type: ResourcePermission["resourceType"]) =>
    language.t(`admin.permissions.resourceTypes.${type}` as "admin.permissions.resourceTypes.menu")

  // ── Resource permission matrix ─────────────────────────────────────────────
  const [matrix, setMatrix] = createStore<{
    rows: ResourcePermission[]
    loading: boolean
    savingCode: string | null
  }>({ rows: [], loading: true, savingCode: null })

  async function loadMatrix() {
    setMatrix("loading", true)
    try {
      const res = await adminPermissionApi.listResourcePermissions()
      setMatrix("rows", res.permissions ?? [])
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.permissions.toast.matrixFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setMatrix("loading", false)
    }
  }

  onMount(() => void loadMatrix())

  function rowHasRole(row: ResourcePermission, role: SystemRole) {
    return (row.allowedRoles ?? []).includes(role)
  }

  async function toggleMatrixRole(row: ResourcePermission, role: SystemRole) {
    const current = row.allowedRoles ?? []
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    setMatrix("savingCode", row.resourceCode)
    try {
      await adminPermissionApi.updateResourcePermission(row.resourceCode, next)
      setMatrix("rows", (r) => r.resourceCode === row.resourceCode, "allowedRoles", next)
      showToast({ variant: "success", title: language.t("admin.permissions.toast.matrixSaved") })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.permissions.toast.matrixSaveFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setMatrix("savingCode", null)
    }
  }

  // ── Fine-grained grants (mentor RBAC Phase 2) ──────────────────────────────
  const [grants, setGrants] = createStore<{
    rows: PermissionGrant[]
    loading: boolean
    code: string
    subjectKind: GrantSubjectType
    // user subject
    userQuery: string
    userResults: SearchedUser[]
    userSearching: boolean
    selectedUser: SearchedUser | null
    // department subject
    tree: AdminDept[]
    treeLoading: boolean
    treeLoaded: boolean
    treeUnavailable: boolean
    selectedDept: AdminDept | null
    granting: boolean
    revoking: string | null
  }>({
    rows: [],
    loading: true,
    code: "",
    subjectKind: "user",
    userQuery: "",
    userResults: [],
    userSearching: false,
    selectedUser: null,
    tree: [],
    treeLoading: false,
    treeLoaded: false,
    treeUnavailable: false,
    selectedDept: null,
    granting: false,
    revoking: null,
  })

  const flatDepts = createMemo(() => flattenDepts(grants.tree))

  // ── Metrics-view preset (issue #2): open dashboard scope without raw codes ──
  // Two actions, both backed by adminGrantApi.grant: "see all company metrics"
  // (kanban.scope.all on a user) and "see a specific department" (kanban.scope.dept
  // on a user, with the target department resolved server-side into the grant's
  // dept_path that ResolveUserScope reads).
  const [scopeForm, setScopeForm] = createStore<{
    preset: ScopePreset
    userQuery: string
    userResults: SearchedUser[]
    userSearching: boolean
    selectedUser: SearchedUser | null
    targetDept: AdminDept | null
    granting: boolean
  }>({
    preset: "all",
    userQuery: "",
    userResults: [],
    userSearching: false,
    selectedUser: null,
    targetDept: null,
    granting: false,
  })

  function setScopePreset(preset: ScopePreset) {
    setScopeForm("preset", preset)
    if (preset === "dept") void loadGrantTree()
  }

  let scopeSearchTimer: ReturnType<typeof setTimeout>
  function onScopeUserSearch(value: string) {
    setScopeForm("userQuery", value)
    clearTimeout(scopeSearchTimer)
    const trimmed = value.trim()
    if (!trimmed) {
      setScopeForm("userResults", [])
      return
    }
    scopeSearchTimer = setTimeout(async () => {
      setScopeForm("userSearching", true)
      try {
        const res = await userApi.search(trimmed)
        setScopeForm("userResults", res.users ?? [])
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("admin.permissions.toast.searchFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setScopeForm("userSearching", false)
      }
    }, 300)
  }

  async function submitScopeGrant() {
    if (!scopeForm.selectedUser) {
      showToast({ variant: "error", title: language.t("admin.permissions.grants.scope.needUser") })
      return
    }
    if (scopeForm.preset === "dept" && !scopeForm.targetDept) {
      showToast({ variant: "error", title: language.t("admin.permissions.grants.scope.needTargetDept") })
      return
    }
    const subjectId = userIdOf(scopeForm.selectedUser)
    setScopeForm("granting", true)
    try {
      if (scopeForm.preset === "all") {
        await adminGrantApi.grant({ permissionCode: SCOPE_ALL_CODE, subjectType: "user", subjectId })
      } else {
        await adminGrantApi.grant({
          permissionCode: SCOPE_DEPT_CODE,
          subjectType: "user",
          subjectId,
          targetDeptId: scopeForm.targetDept!.deptId,
        })
      }
      showToast({ variant: "success", title: language.t("admin.permissions.grants.scope.granted") })
      setScopeForm({ selectedUser: null, targetDept: null, userResults: [], userQuery: "" })
      await loadGrants()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.permissions.grants.toast.grantFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setScopeForm("granting", false)
    }
  }

  function isDeptUnavailable(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err)
    return msg.includes(DEPT_UNAVAILABLE_CODE) || msg.includes("department service")
  }

  async function loadGrants() {
    setGrants("loading", true)
    try {
      const res = await adminGrantApi.listGrants()
      setGrants("rows", res.grants ?? [])
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.permissions.grants.toast.listFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setGrants("loading", false)
    }
  }

  async function loadGrantTree() {
    if (grants.treeLoaded || grants.treeLoading) return
    setGrants("treeLoading", true)
    setGrants("treeUnavailable", false)
    try {
      const res = await adminDeptApi.tree()
      setGrants("tree", res.departments ?? [])
      setGrants("treeLoaded", true)
    } catch (err) {
      if (isDeptUnavailable(err)) {
        setGrants("treeUnavailable", true)
        setGrants("treeLoaded", true)
      } else {
        showToast({
          variant: "error",
          title: language.t("admin.permissions.grants.toast.listFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      setGrants("treeLoading", false)
    }
  }

  let grantSearchTimer: ReturnType<typeof setTimeout>
  function onGrantUserSearch(value: string) {
    setGrants("userQuery", value)
    clearTimeout(grantSearchTimer)
    const trimmed = value.trim()
    if (!trimmed) {
      setGrants("userResults", [])
      return
    }
    grantSearchTimer = setTimeout(async () => {
      setGrants("userSearching", true)
      try {
        const res = await userApi.search(trimmed)
        setGrants("userResults", res.users ?? [])
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("admin.permissions.toast.searchFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setGrants("userSearching", false)
      }
    }, 300)
  }

  function setSubjectKind(kind: GrantSubjectType) {
    setGrants("subjectKind", kind)
    setGrants({ selectedUser: null, selectedDept: null, userResults: [], userQuery: "" })
    if (kind === "department") void loadGrantTree()
  }

  async function submitGrant() {
    const code = grants.code.trim()
    const subjectId =
      grants.subjectKind === "user"
        ? grants.selectedUser
          ? userIdOf(grants.selectedUser)
          : ""
        : (grants.selectedDept?.deptId ?? "")
    if (!code || !subjectId) {
      showToast({ variant: "error", title: language.t("admin.permissions.grants.toast.needCodeAndSubject") })
      return
    }
    setGrants("granting", true)
    try {
      await adminGrantApi.grant({ permissionCode: code, subjectType: grants.subjectKind, subjectId })
      showToast({ variant: "success", title: language.t("admin.permissions.grants.toast.granted") })
      setGrants({ code: "", selectedUser: null, selectedDept: null, userResults: [], userQuery: "" })
      await loadGrants()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.permissions.grants.toast.grantFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setGrants("granting", false)
    }
  }

  async function revokeGrant(id: string) {
    setGrants("revoking", id)
    try {
      await adminGrantApi.revoke(id)
      setGrants("rows", grants.rows.filter((g) => g.id !== id))
      showToast({ variant: "success", title: language.t("admin.permissions.grants.toast.revoked") })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.permissions.grants.toast.revokeFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setGrants("revoking", null)
    }
  }

  // Resolve a human-readable subject label for the grants table.
  const deptNameById = createMemo(() => {
    const map = new Map<string, string>()
    for (const f of flatDepts()) map.set(f.dept.deptId, f.dept.deptName)
    return map
  })
  // Match a stored dept_path back to a department name (best effort: the tree may
  // not be loaded, in which case we fall back to the raw path).
  const deptNameByPath = createMemo(() => {
    const map = new Map<string, string>()
    for (const f of flatDepts()) map.set(f.dept.deptPath, f.dept.deptName)
    return map
  })
  function subjectLabel(g: PermissionGrant): string {
    if (g.subjectType === "department") return deptNameById().get(g.subjectId) || g.deptPath || g.subjectId
    return g.subjectId
  }
  // A readable description of a metrics-scope grant for the existing-grants table.
  // Returns null for non-scope grants (which render their raw permission code).
  function scopeDescription(g: PermissionGrant): string | null {
    if (g.permissionCode === SCOPE_ALL_CODE) {
      return language.t("admin.permissions.grants.scope.label.all")
    }
    if (g.permissionCode === SCOPE_DEPT_CODE) {
      const deptName = g.deptPath ? deptNameByPath().get(g.deptPath) || g.deptPath : g.deptPath
      return language.t("admin.permissions.grants.scope.label.dept", { dept: deptName })
    }
    return null
  }

  // Load grants when the tab is first opened (keeps the initial paint cheap).
  // Also warm the department tree so existing kanban.scope.dept grants can render
  // their target department name (best effort: falls back to the raw path / shows
  // the unavailable notice if dept-sync is down — never blocks the grant list).
  let grantsLoadedOnce = false
  function onGrantsTab() {
    if (grantsLoadedOnce) return
    grantsLoadedOnce = true
    void loadGrants()
    void loadGrantTree()
  }

  // ── My permissions (debug view) ────────────────────────────────────────────
  const perms = createMemo(() => auth.permissions())

  const tabLabel = (t: Tab) => language.t(`admin.permissions.tabs.${t}` as "admin.permissions.tabs.roles")

  return (
    <section class={sx.section}>
      <div class={sx.head}>
        <div>
          <h1 class={sx.title}>{language.t("admin.permissions.title")}</h1>
          <p class={sx.sub}>{language.t("admin.permissions.subtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div class="mb-4 flex flex-wrap gap-1" role="tablist" aria-label={language.t("admin.permissions.title")}>
        <For each={TABS}>
          {(t) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === t}
              class={st.tab(tab() === t)}
              onClick={() => {
                setTab(t)
                if (t === "grants") onGrantsTab()
              }}
            >
              {tabLabel(t)}
            </button>
          )}
        </For>
      </div>

      {/* ── Tab: Resource matrix ── */}
      <Show when={tab() === "matrix"}>
        <div class="flex flex-col gap-3">
          <p class={sx.sub}>{language.t("admin.permissions.matrix.help")}</p>

          <div class={sx.tableShell}>
            <Show when={matrix.loading}>
              <div class={sx.overlay}>
                <div class={sx.spinner} />
              </div>
            </Show>

            <table class={sx.dtStatic}>
              <thead>
                <tr>
                  <th>{language.t("admin.permissions.matrix.columns.resource")}</th>
                  <th class="w-24">{language.t("admin.permissions.matrix.columns.type")}</th>
                  <For each={ROLES}>
                    {(role) => <th class="w-36 text-center">{roleLabel(role)}</th>}
                  </For>
                  <th class="w-40">{language.t("admin.permissions.matrix.columns.access")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={matrix.rows}>
                  {(row) => (
                    <tr>
                      <td class="text-[var(--native-foreground)]" title={row.resourceCode}>
                        <div class="font-semibold">{resourceLabel(row.resourceCode)}</div>
                        <div class="mt-0.5 text-[12px] font-normal text-[var(--native-muted)]">{row.resourceCode}</div>
                      </td>
                      <td>
                        <span class="inline-flex items-center rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-surface)_70%,transparent)] px-2 py-0.5 text-[11px] uppercase tracking-[0.04em] text-[var(--native-muted)]">
                          {resourceTypeLabel(row.resourceType)}
                        </span>
                      </td>
                      <For each={ROLES}>
                        {(role) => (
                          <td class="text-center">
                            <input
                              type="checkbox"
                              class="size-4 cursor-pointer accent-[var(--native-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                              checked={rowHasRole(row, role)}
                              disabled={matrix.savingCode === row.resourceCode}
                              aria-label={`${resourceLabel(row.resourceCode)} · ${roleLabel(role)}`}
                              onChange={() => void toggleMatrixRole(row, role)}
                            />
                          </td>
                        )}
                      </For>
                      <td class="text-[12px] text-[var(--native-muted)]">
                        <Show
                          when={(row.allowedRoles ?? []).length === 0}
                          fallback={language.t("admin.permissions.matrix.restricted")}
                        >
                          {language.t("admin.permissions.matrix.openToAll")}
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>

            <Show when={!matrix.loading && matrix.rows.length === 0}>
              <div class={sx.state}>{language.t("admin.permissions.matrix.empty")}</div>
            </Show>
          </div>
        </div>
      </Show>

      {/* ── Tab: Fine-grained grants (mentor RBAC) ── */}
      <Show when={tab() === "grants"}>
        <div class="flex flex-col gap-5">
          {/* Metrics-view preset (issue #2): friendly entry for the kanban.scope.* codes */}
          <div class="flex max-w-[560px] flex-col gap-4 rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-primary)_28%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_5%,transparent)] p-4">
            <div class="flex flex-col gap-1">
              <h2 class="text-[0.875rem] font-semibold text-[var(--native-foreground)]">
                {language.t("admin.permissions.grants.scope.title")}
              </h2>
              <p class={sx.sub}>{language.t("admin.permissions.grants.scope.help")}</p>
            </div>

            {/* Preset selector */}
            <div class="flex flex-col gap-1.5">
              <span class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
                {language.t("admin.permissions.grants.scope.preset")}
              </span>
              <div
                class="flex flex-wrap gap-1"
                role="tablist"
                aria-label={language.t("admin.permissions.grants.scope.preset")}
              >
                <For each={["all", "dept"] as const}>
                  {(preset) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={scopeForm.preset === preset}
                      class={st.tab(scopeForm.preset === preset)}
                      onClick={() => setScopePreset(preset)}
                    >
                      {language.t(
                        `admin.permissions.grants.scope.preset.${preset}` as "admin.permissions.grants.scope.preset.all",
                      )}
                    </button>
                  )}
                </For>
              </div>
              <p class="text-[12px] text-[var(--native-muted)]">
                {language.t(
                  `admin.permissions.grants.scope.preset.${scopeForm.preset}.hint` as "admin.permissions.grants.scope.preset.all.hint",
                )}
              </p>
            </div>

            {/* Subject: user search */}
            <div class="flex flex-col gap-1.5">
              <div class={sx.searchWrap}>
                <svg
                  class={sx.searchIcon}
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <g transform="scale(0.833333)">
                    <path d="m21 21-4.34-4.34" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="11" cy="11" r="8" stroke="currentColor" />
                  </g>
                </svg>
                <input
                  class={sx.search}
                  placeholder={language.t("admin.permissions.grants.searchUserPlaceholder")}
                  value={scopeForm.userQuery}
                  aria-label={language.t("admin.permissions.grants.searchUserPlaceholder")}
                  onInput={(e) => onScopeUserSearch(e.currentTarget.value)}
                />
              </div>

              <Show when={scopeForm.selectedUser}>
                {(u) => (
                  <div class="flex items-center justify-between gap-3 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-primary)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_6%,transparent)] px-2.5 py-2">
                    <div class="flex min-w-0 items-center gap-2.5">
                      <AvatarDisplay
                        avatarUrl={u().avatarUrl}
                        username={u().displayName || u().name}
                        size="1.75rem"
                        class="shrink-0"
                      />
                      <div class="min-w-0">
                        <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">
                          {u().displayName || u().name}
                        </div>
                        <div class="truncate text-[12px] text-[var(--native-muted)]">{(u() as any).email ?? ""}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="shrink-0 cursor-pointer rounded-[var(--native-radius-sm)] p-1 text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)]"
                      aria-label={language.t("common.cancel")}
                      onClick={() => setScopeForm("selectedUser", null)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </Show>

              <Show when={!scopeForm.selectedUser && scopeForm.userResults.length > 0}>
                <div class="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  <For each={scopeForm.userResults}>
                    {(u) => (
                      <button
                        type="button"
                        class="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-transparent px-2.5 py-2 text-left transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-surface)_62%,transparent)]"
                        onClick={() => setScopeForm({ selectedUser: u, userResults: [], userQuery: "" })}
                      >
                        <div class="flex min-w-0 items-center gap-2.5">
                          <AvatarDisplay
                            avatarUrl={u.avatarUrl}
                            username={u.displayName || u.name}
                            size="1.75rem"
                            class="shrink-0"
                          />
                          <div class="min-w-0">
                            <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">
                              {u.displayName || u.name}
                            </div>
                            <div class="truncate text-[12px] text-[var(--native-muted)]">{(u as any).email}</div>
                          </div>
                        </div>
                        <Icon name="plus-small" size="small" class="shrink-0 text-[var(--native-muted)]" />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Target department (dept preset only) */}
            <Show when={scopeForm.preset === "dept"}>
              <div class="flex flex-col gap-1.5">
                <span class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
                  {language.t("admin.permissions.grants.scope.targetDepartment")}
                </span>

                <Show when={grants.treeLoading}>
                  <div class="py-2 text-[0.8125rem] text-[var(--native-muted)]">
                    {language.t("admin.permissions.grants.deptLoading")}
                  </div>
                </Show>

                <Show when={grants.treeUnavailable}>
                  <div class="rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_50%,transparent)] px-3 py-2 text-[0.8125rem] text-[var(--native-muted)]">
                    {language.t("admin.permissions.grants.deptUnavailable")}
                  </div>
                </Show>

                <Show when={!grants.treeLoading && !grants.treeUnavailable && flatDepts().length > 0}>
                  <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] p-1">
                    <For each={flatDepts()}>
                      {(f) => (
                        <button
                          type="button"
                          class={`flex cursor-pointer items-center gap-2 rounded-[var(--native-radius-sm)] px-2 py-1.5 text-left text-[0.8125rem] transition-colors ${
                            scopeForm.targetDept?.deptId === f.dept.deptId
                              ? "bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)] text-[var(--native-foreground)]"
                              : "text-[var(--native-foreground)] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_55%,transparent)]"
                          }`}
                          style={{ "padding-left": `${0.5 + f.depth * 1}rem` }}
                          aria-pressed={scopeForm.targetDept?.deptId === f.dept.deptId}
                          onClick={() => setScopeForm("targetDept", f.dept)}
                        >
                          <Icon name="folder" size="small" class="shrink-0 text-[var(--native-muted)]" />
                          <span class="truncate">{f.dept.deptName}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            <div>
              <Button class="cursor-pointer" disabled={scopeForm.granting} onClick={() => void submitScopeGrant()}>
                {language.t("admin.permissions.grants.scope.grant")}
              </Button>
            </div>
          </div>

          <p class={sx.sub}>{language.t("admin.permissions.grants.help")}</p>

          {/* Grant builder */}
          <div class="flex max-w-[560px] flex-col gap-4 rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,transparent)] p-4">
            {/* Permission code */}
            <div class="flex flex-col gap-1.5">
              <label class="text-[0.8125rem] font-medium text-[var(--native-foreground)]" for="grant-code">
                {language.t("admin.permissions.grants.permissionCode")}
              </label>
              <input
                id="grant-code"
                class={sx.search}
                placeholder={language.t("admin.permissions.grants.permissionCodePlaceholder")}
                value={grants.code}
                onInput={(e) => setGrants("code", e.currentTarget.value)}
              />
            </div>

            {/* Subject kind toggle */}
            <div class="flex flex-col gap-1.5">
              <span class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
                {language.t("admin.permissions.grants.subjectKind")}
              </span>
              <div class="flex gap-1" role="tablist" aria-label={language.t("admin.permissions.grants.subjectKind")}>
                <For each={["user", "department"] as const}>
                  {(kind) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={grants.subjectKind === kind}
                      class={st.tab(grants.subjectKind === kind)}
                      onClick={() => setSubjectKind(kind)}
                    >
                      {language.t(`admin.permissions.grants.subjectKind.${kind}` as "admin.permissions.grants.subjectKind.user")}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Subject: user search */}
            <Show when={grants.subjectKind === "user"}>
              <div class="flex flex-col gap-1.5">
                <div class={sx.searchWrap}>
                  <svg class={sx.searchIcon} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <g transform="scale(0.833333)">
                      <path d="m21 21-4.34-4.34" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
                      <circle cx="11" cy="11" r="8" stroke="currentColor" />
                    </g>
                  </svg>
                  <input
                    class={sx.search}
                    placeholder={language.t("admin.permissions.grants.searchUserPlaceholder")}
                    value={grants.userQuery}
                    aria-label={language.t("admin.permissions.grants.searchUserPlaceholder")}
                    onInput={(e) => onGrantUserSearch(e.currentTarget.value)}
                  />
                </div>

                <Show when={grants.selectedUser}>
                  {(u) => (
                    <div class="flex items-center justify-between gap-3 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-primary)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_6%,transparent)] px-2.5 py-2">
                      <div class="flex min-w-0 items-center gap-2.5">
                        <AvatarDisplay avatarUrl={u().avatarUrl} username={u().displayName || u().name} size="1.75rem" class="shrink-0" />
                        <div class="min-w-0">
                          <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">{u().displayName || u().name}</div>
                          <div class="truncate text-[12px] text-[var(--native-muted)]">{(u() as any).email ?? ""}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="shrink-0 cursor-pointer rounded-[var(--native-radius-sm)] p-1 text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)]"
                        aria-label={language.t("common.cancel")}
                        onClick={() => setGrants("selectedUser", null)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </Show>

                <Show when={!grants.selectedUser && grants.userResults.length > 0}>
                  <div class="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                    <For each={grants.userResults}>
                      {(u) => (
                        <button
                          type="button"
                          class="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-transparent px-2.5 py-2 text-left transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-surface)_62%,transparent)]"
                          onClick={() => setGrants({ selectedUser: u, userResults: [], userQuery: "" })}
                        >
                          <div class="flex min-w-0 items-center gap-2.5">
                            <AvatarDisplay avatarUrl={u.avatarUrl} username={u.displayName || u.name} size="1.75rem" class="shrink-0" />
                            <div class="min-w-0">
                              <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">{u.displayName || u.name}</div>
                              <div class="truncate text-[12px] text-[var(--native-muted)]">{(u as any).email}</div>
                            </div>
                          </div>
                          <Icon name="plus-small" size="small" class="shrink-0 text-[var(--native-muted)]" />
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Subject: department picker */}
            <Show when={grants.subjectKind === "department"}>
              <div class="flex flex-col gap-1.5">
                <span class="text-[0.8125rem] font-medium text-[var(--native-foreground)]">
                  {language.t("admin.permissions.grants.selectDepartment")}
                </span>

                <Show when={grants.treeLoading}>
                  <div class="py-2 text-[0.8125rem] text-[var(--native-muted)]">
                    {language.t("admin.permissions.grants.deptLoading")}
                  </div>
                </Show>

                <Show when={grants.treeUnavailable}>
                  <div class="rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-surface)_50%,transparent)] px-3 py-2 text-[0.8125rem] text-[var(--native-muted)]">
                    {language.t("admin.permissions.grants.deptUnavailable")}
                  </div>
                </Show>

                <Show when={!grants.treeLoading && !grants.treeUnavailable && flatDepts().length > 0}>
                  <div class="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] p-1">
                    <For each={flatDepts()}>
                      {(f) => (
                        <button
                          type="button"
                          class={`flex cursor-pointer items-center gap-2 rounded-[var(--native-radius-sm)] px-2 py-1.5 text-left text-[0.8125rem] transition-colors ${
                            grants.selectedDept?.deptId === f.dept.deptId
                              ? "bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)] text-[var(--native-foreground)]"
                              : "text-[var(--native-foreground)] hover:bg-[color:color-mix(in_oklab,var(--native-surface)_55%,transparent)]"
                          }`}
                          style={{ "padding-left": `${0.5 + f.depth * 1}rem` }}
                          aria-pressed={grants.selectedDept?.deptId === f.dept.deptId}
                          onClick={() => setGrants("selectedDept", f.dept)}
                        >
                          <Icon name="folder" size="small" class="shrink-0 text-[var(--native-muted)]" />
                          <span class="truncate">{f.dept.deptName}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>

            <div>
              <Button class="cursor-pointer" disabled={grants.granting} onClick={() => void submitGrant()}>
                {language.t("admin.permissions.grants.grant")}
              </Button>
            </div>
          </div>

          {/* Existing grants */}
          <div class="flex flex-col gap-2">
            <h2 class="text-[0.8125rem] font-semibold uppercase tracking-[0.05em] text-[var(--native-muted)]">
              {language.t("admin.permissions.grants.existing")}
            </h2>

            <div class={sx.tableShell}>
              <Show when={grants.loading}>
                <div class={sx.overlay}>
                  <div class={sx.spinner} />
                </div>
              </Show>

              <table class={sx.dtStatic}>
                <thead>
                  <tr>
                    <th>{language.t("admin.permissions.grants.columns.permission")}</th>
                    <th class="w-28">{language.t("admin.permissions.grants.columns.subjectType")}</th>
                    <th>{language.t("admin.permissions.grants.columns.subject")}</th>
                    <th class="w-28 text-right">{language.t("admin.permissions.grants.columns.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={grants.rows}>
                    {(g) => (
                      <tr>
                        <td class="font-semibold text-[var(--native-foreground)]" title={g.permissionCode}>
                          <div>{resourceLabel(g.permissionCode)}</div>
                          <div class="mt-0.5 text-[12px] font-normal text-[var(--native-muted)]">{g.permissionCode}</div>
                          <Show when={scopeDescription(g)}>
                            {(desc) => (
                              <div class="mt-0.5 text-[12px] font-normal text-[var(--native-primary)]">{desc()}</div>
                            )}
                          </Show>
                        </td>
                        <td>
                          <span class="inline-flex items-center rounded-[var(--native-radius-full)] bg-[color:color-mix(in_oklab,var(--native-surface)_70%,transparent)] px-2 py-0.5 text-[11px] text-[var(--native-muted)]">
                            {language.t(`admin.permissions.grants.subjectKind.${g.subjectType}` as "admin.permissions.grants.subjectKind.user")}
                          </span>
                        </td>
                        <td class="text-[var(--native-foreground)]">{subjectLabel(g)}</td>
                        <td class="text-right">
                          <button
                            type="button"
                            class="cursor-pointer rounded-[var(--native-radius-sm)] px-2 py-1 text-[12px] text-[var(--native-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--native-error)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={grants.revoking === g.id}
                            onClick={() => void revokeGrant(g.id)}
                          >
                            {language.t("admin.permissions.grants.revoke")}
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>

              <Show when={!grants.loading && grants.rows.length === 0}>
                <div class={sx.state}>{language.t("admin.permissions.grants.empty")}</div>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* ── Tab: My permissions ── */}
      <Show when={tab() === "mine"}>
        <div class="flex flex-col gap-4">
          <p class={sx.sub}>{language.t("admin.permissions.mine.help")}</p>

          <Show
            when={perms()}
            fallback={<div class={sx.state}>{language.t("admin.permissions.mine.none")}</div>}
          >
            {(p) => (
              <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                <For
                  each={
                    [
                      { key: "menus", labelKey: "admin.permissions.mine.menus", values: p().menus },
                      { key: "apis", labelKey: "admin.permissions.mine.apis", values: p().apis },
                      { key: "capabilities", labelKey: "admin.permissions.mine.capabilities", values: p().capabilities },
                    ] as const
                  }
                >
                  {(group) => (
                    <div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_45%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_80%,transparent)] p-4">
                      <div class="mb-2 flex items-center justify-between">
                        <h2 class="text-[0.8125rem] font-semibold uppercase tracking-[0.05em] text-[var(--native-muted)]">
                          {language.t(group.labelKey)}
                        </h2>
                        <span class="text-[12px] text-[var(--native-muted)] [font-variant-numeric:tabular-nums]">
                          {group.values.length}
                        </span>
                      </div>
                      <Show
                        when={group.values.length > 0}
                        fallback={<div class="text-[0.8125rem] text-[var(--native-muted)]">{language.t("admin.permissions.mine.empty")}</div>}
                      >
                        <div class="flex flex-wrap gap-1.5">
                          <For each={group.values}>
                            {(v) => (
                              <span
                                class="inline-flex items-center rounded-[var(--native-radius-sm)] bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] px-2 py-0.5 text-[12px] text-[var(--native-foreground)]"
                                title={v}
                              >
                                {resourceLabel(v)}
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </section>
  )
}
