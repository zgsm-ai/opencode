import { createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { submitCorrection, loadCorrectionHistory } from "../../lib/api"
import { formatDay } from "../../lib/date-range"
import { useLanguage } from "@/context/language"
import type { CorrectionPayload, EfficiencyDimension } from "../../lib/types"

type Props = {
  dimension: EfficiencyDimension
  dimensionId: string
  rawDays?: number | null
  correctedDays?: number | null
  startDate: string
  endDate: string
  onCorrected?: () => void | Promise<void>
}

function fmtDate(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function CorrectionDialog(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const [form, setForm] = createStore({
    value: props.correctedDays ?? props.rawDays ?? 0,
    reason: "",
    operator: "",
    saving: false,
  })

  const [history, { refetch }] = createResource(
    () => ({ dimension: props.dimension, dimensionId: props.dimensionId }),
    async (input) => loadCorrectionHistory(input),
  )

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const payload: CorrectionPayload = {
      dimension: props.dimension,
      dimensionId: props.dimensionId,
      startDate: props.startDate,
      endDate: props.endDate,
      value: Number(form.value),
      reason: form.reason,
      operator: form.operator,
    }

    if (!payload.reason.trim()) {
      showToast({ variant: "error", title: language.t("kanban.validation.correctionReasonRequired") })
      return
    }
    if (!payload.operator.trim()) {
      showToast({ variant: "error", title: language.t("kanban.validation.operatorRequired") })
      return
    }

    setForm("saving", true)
    try {
      await submitCorrection(payload)
      await refetch()
      await props.onCorrected?.()
      showToast({ variant: "success", title: language.t("kanban.toast.correctionSubmitted") })
      dialog.close()
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("kanban.toast.correctionFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Modal
        title={language.t("kanban.dialog.correction")}
        maxWidth="720px"
        maxHeight="calc(100vh - 80px)"
        footer={
          <>
            <Button variant="outline" size="sm" type="button" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button size="sm" type="submit" disabled={form.saving}>
              {form.saving ? `${language.t("common.submit")}...` : language.t("common.submit")}
            </Button>
          </>
        }
      >
        <div class="modal-section">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.dimension")}</label>
              <input class="modal-input" value={props.dimension} disabled />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.dimensionId")}</label>
              <input class="modal-input" value={props.dimensionId} disabled />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.rawValue")}</label>
              <input class="modal-input" value={props.rawDays == null ? "-" : String(props.rawDays)} disabled />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.dateRange")}</label>
              <input class="modal-input" value={`${formatDay(props.startDate)}  To  ${formatDay(props.endDate)}`} disabled />
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.correctedValue")}</label>
              <input
                class="modal-input"
                type="number"
                min="0"
                step="0.1"
                value={form.value}
                onInput={(e) => setForm("value", Number(e.currentTarget.value))}
              />
            </div>
            <div class="modal-field">
              <label class="modal-label">{language.t("kanban.form.operator")}</label>
              <input class="modal-input" value={form.operator} onInput={(e) => setForm("operator", e.currentTarget.value)} placeholder={language.t("kanban.form.operatorPlaceholder")} />
            </div>
          </div>

          <div class="modal-field">
            <label class="modal-label">{language.t("kanban.form.correctionReason")}</label>
            <textarea class="modal-input" value={form.reason} onInput={(e) => setForm("reason", e.currentTarget.value)} placeholder={language.t("kanban.form.correctionReasonPlaceholder")} />
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">{language.t("kanban.dialog.correctionHistory")}</div>
          <div class="modal-section-desc">{language.t("kanban.dialog.correctionHistoryDesc")}</div>
          {history.loading ? (
            <div class="text-sm text-[var(--native-muted)]">{language.t("common.loading")}...</div>
          ) : history()?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language.t("kanban.table.time")}</TableHead>
                  <TableHead>{language.t("kanban.table.field")}</TableHead>
                  <TableHead>{language.t("kanban.table.oldValue")}</TableHead>
                  <TableHead>{language.t("kanban.table.newValue")}</TableHead>
                  <TableHead>{language.t("kanban.table.reason")}</TableHead>
                  <TableHead>{language.t("kanban.form.operator")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history()!.map((item) => (
                  <TableRow>
                    <TableCell>{fmtDate(item.corrected_at)}</TableCell>
                    <TableCell>{item.field_name || "-"}</TableCell>
                    <TableCell>{item.old_value || "-"}</TableCell>
                    <TableCell>{item.new_value || "-"}</TableCell>
                    <TableCell>{item.reason || "-"}</TableCell>
                    <TableCell>{item.corrected_by || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div class="text-sm text-[var(--native-muted)]">{language.t("kanban.dialog.noCorrectionRecords")}</div>
          )}
        </div>
      </Modal>
    </form>
  )
}

export default CorrectionDialog
