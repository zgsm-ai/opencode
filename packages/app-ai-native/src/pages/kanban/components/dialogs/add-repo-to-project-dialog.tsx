import { createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DateRangePicker } from "../filters/date-range-picker"
import { addRepoToProject, checkProjectConflicts, createProjectOption, loadProjectOptions } from "../../lib/api"
import { formatLocalTime, shortId } from "../../lib/formatters"
import type { DateRangeValue, ProjectConflict, RepoCommitRow } from "../../lib/types"

type Props = {
  repoAddr: string
  repoBranch?: string
  commits: RepoCommitRow[]
  dateRange?: DateRangeValue
  onAdded?: () => void | Promise<void>
}

function sameRange(a: DateRangeValue, b: DateRangeValue) {
  if (!a && !b) return true
  if (!a || !b) return false
  return a[0] === b[0] && a[1] === b[1]
}

function dayOf(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

export function AddRepoToProjectDialog(props: Props) {
  const language = useLanguage()
  const dialog = useDialog()
  const [state, setState] = createStore({
    selectedProjectId: "",
    newProjectName: "",
    newProjectDesc: "",
    addProjectDateRange: null as DateRangeValue,
    whitelistMode: false,
    selectedCommitIds: [] as string[],
    conflicts: [] as ProjectConflict[],
    conflictsChecked: false,
    saving: false,
  })

  const [projects] = createResource(async () => {
    try {
      return await loadProjectOptions()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("kanban.toast.loadFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  })

  const touch = () => {
    if (!state.conflictsChecked && state.conflicts.length === 0) return
    setState("conflictsChecked", false)
    setState("conflicts", [])
  }

  const selectedSet = createMemo(() => new Set(state.selectedCommitIds))

  const targetCommitIds = createMemo(() => {
    if (state.whitelistMode) return state.selectedCommitIds

    const range = state.addProjectDateRange
    if (!range) {
      return props.commits
        .map((item) => item.commit_id?.trim() ?? "")
        .filter(Boolean)
    }

    return props.commits
      .filter((item) => {
        const day = dayOf(item.commit_time)
        return !!day && day >= range[0] && day <= range[1]
      })
      .map((item) => item.commit_id?.trim() ?? "")
      .filter(Boolean)
  })

  const toggleCommit = (commitId: string, checked: boolean) => {
    touch()
    const next = new Set(state.selectedCommitIds)
    if (checked) next.add(commitId)
    else next.delete(commitId)
    setState("selectedCommitIds", Array.from(next))
  }

  const createProjectIfNeeded = async () => {
    if (state.selectedProjectId !== "__new__") return state.selectedProjectId
    const name = state.newProjectName.trim()
    if (!name) {
      showToast({ variant: "error", title: language.t("kanban.validation.projectNameRequired") })
      return ""
    }
    const project = await createProjectOption({
      name,
      description: state.newProjectDesc,
    })
    return project.project_id
  }

  const submit = async (force = false) => {
    const picked = state.selectedProjectId.trim()
    if (!picked) {
      showToast({ variant: "error", title: language.t("kanban.validation.selectProject") })
      return
    }

    const ids = targetCommitIds()
    if (!ids.length) {
      showToast({ variant: "error", title: language.t("kanban.validation.noCommits") })
      return
    }

    setState("saving", true)
    try {
      if (!force) {
        const conflicts = await checkProjectConflicts(ids)
        setState("conflicts", conflicts)
        setState("conflictsChecked", true)
        if (conflicts.length) return
      }

      const projectId = await createProjectIfNeeded()
      if (!projectId) return

      await addRepoToProject(projectId, {
        repo_addr: props.repoAddr,
        repo_branch: props.repoBranch,
        start_time: state.addProjectDateRange?.[0] ?? null,
        end_time: state.addProjectDateRange?.[1] ?? null,
        include_only_commits: state.whitelistMode ? ids : [],
        exclude_commits: [],
      })

      showToast({ variant: "success", title: language.t("kanban.toast.addedToProject") })
      await props.onAdded?.()
      dialog.close()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("kanban.toast.saveFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setState("saving", false)
    }
  }

  return (
    <Modal
      title={language.t("kanban.dialog.addToProject")}
      maxWidth="920px"
      maxHeight="calc(100vh - 56px)"
      footer={
        <>
          <Button variant="outline" size="sm" type="button" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={state.saving}
            variant={state.conflictsChecked && state.conflicts.length > 0 ? "destructive" : "default"}
            onClick={() => void submit(state.conflictsChecked && state.conflicts.length > 0)}
          >
            {state.saving ? language.t("common.saving") : state.conflictsChecked && state.conflicts.length > 0 ? language.t("kanban.dialog.stillAdd") : language.t("common.confirm")}
          </Button>
        </>
      }
    >
      <div class="modal-section">
        <div class="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div class="modal-field">
            <label class="modal-label">{language.t("kanban.form.targetProject")}</label>
            <select
              class="modal-input"
              value={state.selectedProjectId}
              onChange={(e) => {
                touch()
                setState("selectedProjectId", e.currentTarget.value)
              }}
            >
              <option value="">{language.t("kanban.form.pleaseSelect")}</option>
              <option value="__new__">{language.t("kanban.form.createProject")}</option>
              <For each={projects.latest ?? []}>
                {(item) => <option value={item.project_id}>{item.name}</option>}
              </For>
            </select>
          </div>

          <div class="modal-field">
            <label class="modal-label">{language.t("kanban.form.dateRange")}</label>
            <DateRangePicker
              value={state.addProjectDateRange}
              onChange={(value) => {
                touch()
                if (sameRange(value, state.addProjectDateRange)) return
                setState("addProjectDateRange", value)
              }}
              clearable
              placeholder={language.t("kanban.form.scopeLimit")}
            />
          </div>
        </div>

        <Show when={state.selectedProjectId === "__new__"}>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.projectName")}</label>
              <input
                class="modal-input"
                value={state.newProjectName}
                onInput={(e) => {
                  touch()
                  setState("newProjectName", e.currentTarget.value)
                }}
                placeholder={language.t("kanban.form.projectName")}
              />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.projectDesc")}</label>
              <input
                class="modal-input"
                value={state.newProjectDesc}
                onInput={(e) => {
                  touch()
                  setState("newProjectDesc", e.currentTarget.value)
                }}
                placeholder={language.t("kanban.form.projectDesc")}
              />
            </div>
          </div>
        </Show>

        <label class="mt-4 flex items-center gap-2 text-sm text-[var(--native-foreground)]">
          <input
            type="checkbox"
            class="h-4 w-4 accent-[var(--native-primary)]"
            checked={state.whitelistMode}
            onChange={(e) => {
              touch()
              setState("whitelistMode", e.currentTarget.checked)
              if (!e.currentTarget.checked) setState("selectedCommitIds", [])
            }}
          />
          <span>{language.t("kanban.dialog.whitelistMode")}</span>
        </label>
      </div>

      <Show when={state.whitelistMode}>
        <div class="modal-section">
          <div class="modal-section-title">{language.t("kanban.dialog.selectCommits")}</div>
          <div class="modal-section-desc">{language.t("kanban.dialog.selectCommitsDesc")}</div>
          <div class="max-h-[320px] overflow-auto rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-12">{language.t("kanban.table.select")}</TableHead>
                  <TableHead class="w-28">{language.t("kanban.table.commitId")}</TableHead>
                  <TableHead>{language.t("kanban.table.description")}</TableHead>
                  <TableHead class="w-28">{language.t("kanban.table.user")}</TableHead>
                  <TableHead class="w-44">{language.t("kanban.table.time")}</TableHead>
                  <TableHead class="w-24 text-right">{language.t("kanban.table.codeLines")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={props.commits}>
                  {(item) => {
                    const commitId = item.commit_id?.trim() ?? ""
                    return (
                      <TableRow>
                        <TableCell>
                          <input
                            type="checkbox"
                            class="h-4 w-4 accent-[var(--native-primary)]"
                            checked={selectedSet().has(commitId)}
                            disabled={!commitId}
                            onChange={(e) => toggleCommit(commitId, e.currentTarget.checked)}
                          />
                        </TableCell>
                        <TableCell>{shortId(commitId)}</TableCell>
                        <TableCell>{item.comment || "-"}</TableCell>
                        <TableCell>{item.git_user_name || "-"}</TableCell>
                        <TableCell>{formatLocalTime(item.commit_time)}</TableCell>
                        <TableCell class="text-right tabular-nums">{item.diff_lines ?? "-"}</TableCell>
                      </TableRow>
                    )
                  }}
                </For>
              </TableBody>
            </Table>
          </div>
        </div>
      </Show>

      <Show when={state.conflicts.length > 0}>
        <div class="modal-section">
          <div class="rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-warning)_32%,transparent)] bg-[color:color-mix(in_oklab,var(--native-warning)_8%,var(--native-panel))] p-4">
            <div class="text-sm font-semibold text-[var(--native-foreground)]">{language.t("kanban.dialog.conflictTitle")}</div>
            <div class="mt-3 grid gap-2 text-sm text-[var(--native-muted)]">
              <For each={state.conflicts}>
                {(item) => <div>{shortId(item.commit_id)} → {item.project_name || item.project_id}</div>}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </Modal>
  )
}

export default AddRepoToProjectDialog
