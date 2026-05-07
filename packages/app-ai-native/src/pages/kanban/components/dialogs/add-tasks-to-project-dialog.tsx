import { createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { addTasksToProject, createProjectOption, loadProjectOptions } from "../../lib/api"
import { formatDuration, formatLocalTime, shortId } from "../../lib/formatters"
import type { TaskRow } from "../../lib/types"

type Props = {
  tasks: TaskRow[]
  onAdded?: () => void | Promise<void>
}

function num(value: string) {
  const txt = value.trim()
  if (!txt) return null
  const next = Number(txt)
  if (Number.isNaN(next)) return null
  return Math.max(0, Math.min(1, next))
}

export function AddTasksToProjectDialog(props: Props) {
  const language = useLanguage()
  const dialog = useDialog()
  const [state, setState] = createStore({
    selectedProjectId: "",
    newProjectName: "",
    newProjectDesc: "",
    silica: "1",
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

  const createProjectIfNeeded = async () => {
    if (state.selectedProjectId !== "__new__") return state.selectedProjectId
    const name = state.newProjectName.trim()
    if (!name) {
      showToast({ variant: "error", title: language.t("kanban.validation.projectNameRequired") })
      return ""
    }
    const item = await createProjectOption({
      name,
      description: state.newProjectDesc.trim(),
    })
    return item.project_id
  }

  const submit = async () => {
    const picked = state.selectedProjectId.trim()
    if (!picked) {
      showToast({ variant: "error", title: language.t("kanban.validation.selectProject") })
      return
    }

    const ids = props.tasks.map((item) => item.task_id?.trim() ?? "").filter(Boolean)
    if (!ids.length) {
      showToast({ variant: "error", title: language.t("kanban.validation.noTasks") })
      return
    }

    const weight = num(state.silica)
    if (weight == null) {
      showToast({ variant: "error", title: language.t("kanban.validation.silicaWeightRange") })
      return
    }

    setState("saving", true)
    try {
      const projectId = await createProjectIfNeeded()
      if (!projectId) return

      await addTasksToProject(projectId, {
        task_ids: ids,
        task_ids_silica: ids.map(() => weight),
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
      maxWidth="860px"
      maxHeight="calc(100vh - 56px)"
      footer={
        <>
          <Button variant="outline" size="sm" type="button" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button size="sm" type="button" disabled={state.saving} onClick={() => void submit()}>
            {state.saving ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </>
      }
    >
      <div class="modal-section">
        <div class="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
          <div class="modal-field">
            <label class="modal-label">{language.t("kanban.form.targetProject")}</label>
            <select class="modal-input" value={state.selectedProjectId} onChange={(e) => setState("selectedProjectId", e.currentTarget.value)}>
              <option value="">{language.t("kanban.form.pleaseSelect")}</option>
              <option value="__new__">{language.t("kanban.form.createProject")}</option>
              <For each={projects.latest ?? []}>
                {(item) => <option value={item.project_id}>{item.name}</option>}
              </For>
            </select>
          </div>

          <div class="modal-field">
            <label class="modal-label">{language.t("kanban.form.silicaWeight")}</label>
            <input class="modal-input" value={state.silica} onInput={(e) => setState("silica", e.currentTarget.value)} placeholder={language.t("kanban.form.silicaWeightPlaceholder")} />
          </div>
        </div>

        <Show when={state.selectedProjectId === "__new__"}>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.projectName")}</label>
              <input class="modal-input" value={state.newProjectName} onInput={(e) => setState("newProjectName", e.currentTarget.value)} placeholder={language.t("kanban.form.projectName")} />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.projectDesc")}</label>
              <input class="modal-input" value={state.newProjectDesc} onInput={(e) => setState("newProjectDesc", e.currentTarget.value)} placeholder={language.t("kanban.form.projectDesc")} />
            </div>
          </div>
        </Show>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">{language.t("kanban.dialog.selectedTasks")}</div>
        <div class="modal-section-desc">{language.t("kanban.dialog.selectedTasksDesc")}</div>
        <div class="max-h-[360px] overflow-auto rounded-[var(--native-radius-md)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-24">{language.t("kanban.table.taskId")}</TableHead>
                <TableHead>{language.t("kanban.table.description")}</TableHead>
                <TableHead class="w-28">{language.t("kanban.table.user")}</TableHead>
                <TableHead class="w-40">{language.t("kanban.table.time")}</TableHead>
                <TableHead class="w-28 text-right">{language.t("kanban.table.actualDuration")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={props.tasks}>
                {(item) => (
                  <TableRow>
                    <TableCell>{shortId(item.task_id, 6)}</TableCell>
                    <TableCell>{item.title || "-"}</TableCell>
                    <TableCell>{item.user_name || item.user_id || "-"}</TableCell>
                    <TableCell>{formatLocalTime(item.start_time)}</TableCell>
                    <TableCell class="text-right">{formatDuration(item.task_real_minutes_manual ?? item.task_real_minutes, language.t)}</TableCell>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </div>
      </div>
    </Modal>
  )
}

export default AddTasksToProjectDialog
