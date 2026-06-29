import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { For, Show, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import AvatarDisplay from "@/components/avatar-display"
import { useLanguage } from "@/context/language"
import {
  adminDeptApi,
  distributionApi,
  itemApi,
  userApi,
  type AdminDept,
  type CapabilityItem,
  type SearchedUser,
} from "@/pages/store/lib/api"

type Props = {
  onCreated: () => void
}

const PERMISSION_OPTIONS = [
  { value: "readonly", label: "admin.distributions.permission.readonly" },
  { value: "dismissible", label: "admin.distributions.permission.dismissible" },
] as const

const SCOPE_OPTIONS = [
  { value: "user", label: "admin.distributions.scope.user" },
  { value: "organization", label: "admin.distributions.scope.organization" },
  { value: "department", label: "admin.distributions.scope.department" },
] as const

// Matches the dept-sync "service unavailable" signal used by the members /
// permissions pages so the wizard renders a calm notice instead of a hard error
// when dept-sync is not configured.
const DEPT_UNAVAILABLE_CODE = "dept_sync_unavailable"

export function DistributionWizardDialog(props: Props) {
  const language = useLanguage()
  const dialog = useDialog()

  const [store, setStore] = createStore({
    // step 1: items
    itemQuery: "",
    itemResults: [] as CapabilityItem[],
    itemSearching: false,
    selectedItems: [] as CapabilityItem[],
    // step 2: targets
    scopeType: "user" as "user" | "organization" | "department",
    targetQuery: "",
    targetResults: [] as SearchedUser[],
    targetSearching: false,
    selectedUsers: [] as SearchedUser[],
    orgInput: "",
    selectedOrgs: [] as string[],
    // department scope: dept-sync tree (lazy-loaded) + single selected dept
    selectedDepts: [] as { id: string; name: string }[],
    deptTree: [] as AdminDept[],
    deptTreeLoaded: false,
    deptTreeLoading: false,
    deptTreeError: "",
    // step 3: options
    permissionMode: "readonly" as "readonly" | "dismissible",
    message: "",
    submitting: false,
  })

  let itemTimer: ReturnType<typeof setTimeout>
  let targetTimer: ReturnType<typeof setTimeout>

  const searchItems = (q: string) => {
    clearTimeout(itemTimer)
    const trimmed = q.trim()
    if (!trimmed) {
      setStore("itemResults", [])
      return
    }
    itemTimer = setTimeout(async () => {
      setStore("itemSearching", true)
      try {
        const res = await itemApi.list({ search: trimmed, page: 1, pageSize: 10, paginated: true })
        const existing = new Set(store.selectedItems.map((i) => i.id))
        setStore(
          "itemResults",
          (res.items ?? []).filter((i) => !existing.has(i.id)),
        )
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("admin.distributions.toast.itemSearchFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setStore("itemSearching", false)
      }
    }, 300)
  }

  const toggleItem = (item: CapabilityItem) => {
    const exists = store.selectedItems.find((i) => i.id === item.id)
    if (exists) {
      setStore("selectedItems", store.selectedItems.filter((i) => i.id !== item.id))
    } else {
      setStore("selectedItems", [...store.selectedItems, item])
      setStore("itemResults", store.itemResults.filter((i) => i.id !== item.id))
      setStore("itemQuery", "")
    }
  }

  const searchTargets = (q: string) => {
    clearTimeout(targetTimer)
    const trimmed = q.trim()
    if (!trimmed) {
      setStore("targetResults", [])
      return
    }
    targetTimer = setTimeout(async () => {
      setStore("targetSearching", true)
      try {
        const res = await userApi.search(trimmed)
        const existing = new Set(store.selectedUsers.map((u) => u.id))
        setStore(
          "targetResults",
          (res.users ?? []).filter((u) => !existing.has(u.id)),
        )
      } catch (err) {
        showToast({
          variant: "error",
          title: language.t("admin.distributions.toast.targetSearchFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setStore("targetSearching", false)
      }
    }, 300)
  }

  const toggleUser = (user: SearchedUser) => {
    const exists = store.selectedUsers.find((u) => u.id === user.id)
    if (exists) {
      setStore("selectedUsers", store.selectedUsers.filter((u) => u.id !== user.id))
    } else {
      setStore("selectedUsers", [...store.selectedUsers, user])
      setStore("targetResults", store.targetResults.filter((u) => u.id !== user.id))
      setStore("targetQuery", "")
    }
  }

  const addOrg = () => {
    const org = store.orgInput.trim()
    if (!org) return
    if (!store.selectedOrgs.includes(org)) {
      setStore("selectedOrgs", [...store.selectedOrgs, org])
    }
    setStore("orgInput", "")
  }

  // Department tree: collapse state per node (default expanded), mirroring the
  // admin members page tree.
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({})
  const isCollapsed = (id: string) => collapsed()[id] === true
  const toggleCollapse = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  // Lazily fetch the dept-sync tree the first time the user picks the department
  // scope. A 503 (dept-sync not configured) is surfaced as an inline notice
  // rather than a toast, consistent with the members/permissions pages.
  const loadDeptTree = async () => {
    if (store.deptTreeLoading) return
    setStore("deptTreeLoading", true)
    setStore("deptTreeError", "")
    try {
      const res = await adminDeptApi.tree()
      setStore("deptTree", res.departments ?? [])
      setStore("deptTreeLoaded", true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes(DEPT_UNAVAILABLE_CODE) || msg.includes("department service")) {
        setStore("deptTreeError", language.t("admin.distributions.wizard.deptUnavailable"))
      } else {
        setStore("deptTreeError", language.t("admin.distributions.wizard.deptLoadFailed"))
      }
    } finally {
      setStore("deptTreeLoading", false)
    }
  }

  // Single-select: clicking the selected dept clears it; clicking another replaces it.
  const toggleDept = (d: AdminDept) => {
    if (store.selectedDepts[0]?.id === d.deptId) {
      setStore("selectedDepts", [])
    } else {
      setStore("selectedDepts", [{ id: d.deptId, name: d.deptName }])
    }
  }

  const targetCount = () =>
    store.scopeType === "user"
      ? store.selectedUsers.length
      : store.scopeType === "organization"
        ? store.selectedOrgs.length
        : store.selectedDepts.length

  const submit = async () => {
    if (store.selectedItems.length === 0) {
      showToast({ variant: "error", title: language.t("admin.distributions.toast.noItem") })
      return
    }
    if (targetCount() === 0) {
      showToast({ variant: "error", title: language.t("admin.distributions.toast.noTarget") })
      return
    }

    const targets =
      store.scopeType === "user"
        ? store.selectedUsers.map((u) => ({
            scopeType: "user" as const,
            targetId: u.id,
          }))
        : store.scopeType === "organization"
          ? store.selectedOrgs.map((org) => ({ scopeType: "organization" as const, targetId: org }))
          : store.selectedDepts.map((d) => ({ scopeType: "department" as const, targetId: d.id }))

    setStore("submitting", true)
    try {
      let totalRecipients = 0
      for (const item of store.selectedItems) {
        const res = await distributionApi.distribute(item.id, {
          targets,
          permissionMode: store.permissionMode,
          message: store.message || undefined,
        })
        totalRecipients += res.distributions.reduce((sum, d) => sum + d.recipientCount, 0)
      }
      showToast({
        variant: "success",
        title: language.t("admin.distributions.toast.createSuccess"),
        description: language.t("admin.distributions.toast.createSuccessDesc", {
          items: String(store.selectedItems.length),
          recipients: String(totalRecipients),
        }),
      })
      props.onCreated()
      dialog.close()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("admin.distributions.toast.createFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
      setStore("submitting", false)
    }
  }

  const fieldLabel = "text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--native-muted)]"
  const inputCls =
    "h-9 w-full rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_48%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] px-3 text-[0.8125rem] text-[var(--native-foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--native-dim)] focus:border-[var(--native-primary)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--native-primary)_10%,transparent)]"
  const toggleBtn = (on: boolean) =>
    [
      "cursor-pointer rounded-[var(--native-radius-sm)] border px-3 py-1.5 text-[0.8125rem] font-medium transition-all duration-150",
      on
        ? "border-[var(--native-primary)] bg-[color-mix(in_oklab,var(--native-primary)_10%,transparent)] text-[var(--native-primary)]"
        : "border-[color:color-mix(in_oklab,var(--native-border)_44%,transparent)] bg-transparent text-[var(--native-muted)] hover:text-[var(--native-foreground)]",
    ].join(" ")
  const chip =
    "inline-flex items-center gap-1.5 rounded-[var(--native-radius-full)] border border-[color:color-mix(in_oklab,var(--native-primary)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_8%,transparent)] py-0.5 pl-2.5 pr-1.5 text-[12px] text-[var(--native-foreground)]"
  const resultRow =
    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-transparent px-2.5 py-2 text-left transition-colors hover:border-[color:color-mix(in_oklab,var(--native-primary)_30%,transparent)] hover:bg-[color:color-mix(in_oklab,var(--native-primary)_4%,transparent)]"

  // Recursive dept-sync tree node: collapse toggle + selectable name. Selecting a
  // parent distributes to its whole subtree (resolved server-side).
  function DeptTreeNode(props: { node: AdminDept; depth: number }) {
    const node = () => props.node
    const hasChildren = () => !!node().children && node().children!.length > 0
    const selected = () => store.selectedDepts[0]?.id === node().deptId
    return (
      <li role="treeitem" aria-expanded={hasChildren() ? !isCollapsed(node().deptId) : undefined} aria-selected={selected()}>
        <div
          class={`flex items-center gap-1 rounded-[var(--native-radius-sm)] transition-colors ${
            selected()
              ? "bg-[color:color-mix(in_oklab,var(--native-primary)_12%,transparent)]"
              : "hover:bg-[color:color-mix(in_oklab,var(--native-border)_22%,transparent)]"
          }`}
          style={{ "padding-left": `${props.depth * 16}px` }}
        >
          <Show when={hasChildren()} fallback={<span class="inline-block w-5 shrink-0" aria-hidden="true" />}>
            <button
              type="button"
              class="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[var(--native-radius-sm)] text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)]"
              aria-label={
                isCollapsed(node().deptId)
                  ? language.t("admin.distributions.wizard.deptExpand")
                  : language.t("admin.distributions.wizard.deptCollapse")
              }
              onClick={(e) => {
                e.stopPropagation()
                toggleCollapse(node().deptId)
              }}
            >
              <Icon name={isCollapsed(node().deptId) ? "chevron-right" : "chevron-down"} size="small" />
            </button>
          </Show>
          <button
            type="button"
            class={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 pr-2 text-left text-[0.8125rem] transition-colors ${
              selected() ? "font-semibold text-[var(--native-primary)]" : "text-[var(--native-foreground)]"
            }`}
            onClick={() => toggleDept(node())}
          >
            <Icon name="folder" size="small" class="shrink-0 text-[var(--native-muted)]" />
            <span class="truncate">{node().deptName}</span>
          </button>
        </div>
        <Show when={hasChildren() && !isCollapsed(node().deptId)}>
          <ul role="group">
            <For each={node().children}>{(child) => <DeptTreeNode node={child} depth={props.depth + 1} />}</For>
          </ul>
        </Show>
      </li>
    )
  }

  return (
    <Dialog title={language.t("admin.distributions.wizard.title")} class="w-full max-w-[560px] mx-auto">
      <div class="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-6 pt-0">
        {/* Step 1: items */}
        <div class="flex flex-col gap-2">
          <span class={fieldLabel}>{language.t("admin.distributions.wizard.stepItems")}</span>
          <input
            class={inputCls}
            placeholder={language.t("admin.distributions.wizard.itemSearchPlaceholder")}
            value={store.itemQuery}
            onInput={(e) => {
              setStore("itemQuery", e.currentTarget.value)
              searchItems(e.currentTarget.value)
            }}
          />
          <Show when={store.selectedItems.length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <For each={store.selectedItems}>
                {(item) => (
                  <span class={chip}>
                    <span class="max-w-[14rem] truncate">{item.name}</span>
                    <button
                      type="button"
                      class="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
                      aria-label={language.t("admin.distributions.wizard.remove")}
                      onClick={() => toggleItem(item)}
                    >
                      <Icon name="close-small" size="small" />
                    </button>
                  </span>
                )}
              </For>
            </div>
          </Show>
          <Show when={store.itemSearching}>
            <div class="py-2 text-center text-[0.8125rem] text-[var(--native-muted)]">
              {language.t("admin.distributions.wizard.searching")}
            </div>
          </Show>
          <Show when={!store.itemSearching && store.itemResults.length > 0}>
            <div class="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
              <For each={store.itemResults}>
                {(item) => (
                  <button type="button" class={resultRow} onClick={() => toggleItem(item)}>
                    <div class="min-w-0">
                      <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">{item.name}</div>
                      <div class="truncate text-[12px] text-[var(--native-muted)]">{item.itemType}</div>
                    </div>
                    <Icon name="plus-small" size="small" class="shrink-0 text-[var(--native-muted)]" />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Step 2: targets */}
        <div class="flex flex-col gap-2">
          <span class={fieldLabel}>{language.t("admin.distributions.wizard.stepTargets")}</span>
          <div class="flex gap-1.5">
            <For each={SCOPE_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class={toggleBtn(store.scopeType === opt.value)}
                  onClick={() => {
                    setStore("scopeType", opt.value)
                    setStore("targetResults", [])
                    setStore("targetQuery", "")
                    // Reset every scope's selection so switching scopes never leaves
                    // stale targets that could be submitted under another scope.
                    setStore("selectedUsers", [])
                    setStore("selectedOrgs", [])
                    setStore("selectedDepts", [])
                    setStore("orgInput", "")
                    if (opt.value === "department" && !store.deptTreeLoaded && !store.deptTreeLoading) {
                      void loadDeptTree()
                    }
                  }}
                >
                  {language.t(opt.label)}
                </button>
              )}
            </For>
          </div>

          <Show when={store.scopeType === "user"}>
            <input
              class={inputCls}
              placeholder={language.t("admin.distributions.wizard.userSearchPlaceholder")}
              value={store.targetQuery}
              onInput={(e) => {
                setStore("targetQuery", e.currentTarget.value)
                searchTargets(e.currentTarget.value)
              }}
            />
            <Show when={store.selectedUsers.length > 0}>
              <div class="flex flex-col gap-1.5">
                <For each={store.selectedUsers}>
                  {(user) => (
                    <div class="flex items-center justify-between gap-3 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-primary)_18%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_6%,transparent)] px-2.5 py-1.5">
                      <div class="flex min-w-0 items-center gap-2">
                        <AvatarDisplay
                          avatarUrl={user.avatarUrl}
                          username={user.displayName || user.name}
                          size="1.5rem"
                          class="shrink-0"
                        />
                        <div class="min-w-0">
                          <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">
                            {user.displayName || user.name}
                          </div>
                          <div class="truncate text-[12px] text-[var(--native-muted)]">{(user as any).email ?? ""}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
                        aria-label={language.t("admin.distributions.wizard.remove")}
                        onClick={() => toggleUser(user)}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={store.targetSearching}>
              <div class="py-2 text-center text-[0.8125rem] text-[var(--native-muted)]">
                {language.t("admin.distributions.wizard.searching")}
              </div>
            </Show>
            <Show when={!store.targetSearching && store.targetResults.length > 0}>
              <div class="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                <For each={store.targetResults}>
                  {(user) => (
                    <button type="button" class={resultRow} onClick={() => toggleUser(user)}>
                      <div class="flex min-w-0 items-center gap-2">
                        <AvatarDisplay
                          avatarUrl={user.avatarUrl}
                          username={user.displayName || user.name}
                          size="1.5rem"
                          class="shrink-0"
                        />
                        <div class="min-w-0">
                          <div class="truncate text-[0.8125rem] text-[var(--native-foreground)]">
                            {user.displayName || user.name}
                          </div>
                          <div class="truncate text-[12px] text-[var(--native-muted)]">{(user as any).email ?? ""}</div>
                        </div>
                      </div>
                      <Icon name="plus-small" size="small" class="shrink-0 text-[var(--native-muted)]" />
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          <Show when={store.scopeType === "organization"}>
            <div class="flex gap-1.5">
              <input
                class={inputCls}
                placeholder={language.t("admin.distributions.wizard.orgPlaceholder")}
                value={store.orgInput}
                onInput={(e) => setStore("orgInput", e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addOrg()
                  }
                }}
              />
              <Button type="button" variant="ghost" size="normal" onClick={addOrg} class="cursor-pointer shrink-0">
                {language.t("admin.distributions.wizard.orgAdd")}
              </Button>
            </div>
            <Show when={store.selectedOrgs.length > 0}>
              <div class="flex flex-wrap gap-1.5">
                <For each={store.selectedOrgs}>
                  {(org) => (
                    <span class={chip}>
                      <span class="max-w-[14rem] truncate">{org}</span>
                      <button
                        type="button"
                        class="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
                        aria-label={language.t("admin.distributions.wizard.remove")}
                        onClick={() => setStore("selectedOrgs", store.selectedOrgs.filter((o) => o !== org))}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </Show>

          <Show when={store.scopeType === "department"}>
            <p class="text-[12px] leading-snug text-[var(--native-muted)]">
              {language.t("admin.distributions.wizard.deptHint")}
            </p>
            <Show when={store.selectedDepts.length > 0}>
              <div class="flex flex-wrap gap-1.5">
                <For each={store.selectedDepts}>
                  {(dept) => (
                    <span class={chip}>
                      <span class="max-w-[14rem] truncate">{dept.name}</span>
                      <button
                        type="button"
                        class="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[var(--native-muted)] hover:text-[var(--native-foreground)]"
                        aria-label={language.t("admin.distributions.wizard.remove")}
                        onClick={() => setStore("selectedDepts", [])}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <Show when={store.deptTreeLoading}>
              <div class="py-2 text-center text-[0.8125rem] text-[var(--native-muted)]">
                {language.t("admin.distributions.wizard.searching")}
              </div>
            </Show>
            <Show when={!store.deptTreeLoading && store.deptTreeError}>
              <div class="flex flex-col items-center gap-2 rounded-[var(--native-radius-sm)] border border-[color:color-mix(in_oklab,var(--native-border)_40%,transparent)] bg-transparent px-3 py-4 text-center">
                <span class="text-[0.8125rem] text-[var(--native-muted)]">{store.deptTreeError}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="normal"
                  class="cursor-pointer"
                  onClick={() => void loadDeptTree()}
                >
                  {language.t("admin.distributions.wizard.deptRetry")}
                </Button>
              </div>
            </Show>
            <Show when={!store.deptTreeLoading && !store.deptTreeError && store.deptTreeLoaded && store.deptTree.length === 0}>
              <div class="py-3 text-center text-[0.8125rem] text-[var(--native-muted)]">
                {language.t("admin.distributions.wizard.deptEmpty")}
              </div>
            </Show>
            <Show when={!store.deptTreeLoading && !store.deptTreeError && store.deptTree.length > 0}>
              <ul role="tree" class="flex max-h-64 flex-col overflow-y-auto py-1">
                <For each={store.deptTree}>{(node) => <DeptTreeNode node={node} depth={0} />}</For>
              </ul>
            </Show>
          </Show>
        </div>

        {/* Step 3: permission + message */}
        <div class="flex flex-col gap-2">
          <span class={fieldLabel}>{language.t("admin.distributions.wizard.stepOptions")}</span>
          <span class="text-[12px] text-[var(--native-muted)]">
            {language.t("admin.distributions.wizard.permissionLabel")}
          </span>
          <div class="flex gap-1.5">
            <For each={PERMISSION_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class={toggleBtn(store.permissionMode === opt.value)}
                  onClick={() => setStore("permissionMode", opt.value)}
                >
                  {language.t(opt.label)}
                </button>
              )}
            </For>
          </div>
          {/* Clarify what 强制 / 可移除 actually mean for the recipient (UX: meaning was opaque) */}
          <p class="text-[12px] leading-snug text-[var(--native-muted)]">
            {store.permissionMode === "readonly"
              ? language.t("admin.distributions.permission.readonlyDesc")
              : language.t("admin.distributions.permission.dismissibleDesc")}
          </p>
          <span class="mt-1 text-[12px] text-[var(--native-muted)]">
            {language.t("admin.distributions.wizard.messageLabel")}
          </span>
          <textarea
            class={`${inputCls} h-auto min-h-[3.5rem] py-2`}
            placeholder={language.t("admin.distributions.wizard.messagePlaceholder")}
            value={store.message}
            onInput={(e) => setStore("message", e.currentTarget.value)}
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()} class="cursor-pointer">
            {language.t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="large"
            class="cursor-pointer"
            disabled={store.submitting || store.selectedItems.length === 0 || targetCount() === 0}
            onClick={() => void submit()}
          >
            {store.submitting
              ? language.t("admin.distributions.wizard.submitting")
              : language.t("admin.distributions.wizard.submit")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
