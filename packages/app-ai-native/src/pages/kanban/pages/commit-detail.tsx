import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { Modal } from "@/components/modal"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Back from "../components/back"
import { MetricCard } from "../components/metric-card"
import { RatioPill } from "../components/ratio-pill"
import { searchQuery } from "../lib/date-range"
import { getCommitDetail, updateCommitManual } from "../lib/api"
import { formatDuration, formatLocalTime } from "../lib/formatters"
import type { CommitManualPayload, CommitRow } from "../lib/types"

function fmtCost(value?: number | null) {
  if (value == null || value === 0) return "-"
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function text(value?: string | null) {
  const txt = value?.trim()
  return txt || "-"
}

function toNumberOrNull(value: string) {
  const txt = value.trim()
  if (!txt) return null
  const next = Number(txt)
  return Number.isNaN(next) ? null : next
}

function CommitManualDialog(props: { commit: CommitRow; onSaved?: () => void | Promise<void> }) {
  const dialog = useDialog()
  const [form, setForm] = createStore({
    commit_ancient_minutes_manual: props.commit.commit_ancient_minutes_manual?.toString() || props.commit.commit_ancient_minutes?.toString() || "",
    commit_ancient_minutes_reason_manual: props.commit.commit_ancient_minutes_reason_manual || "",
    commit_real_minutes_manual: props.commit.commit_real_minutes_manual?.toString() || props.commit.commit_real_minutes?.toString() || "",
    commit_real_minutes_reason_manual: props.commit.commit_real_minutes_reason_manual || "",
    saving: false,
  })

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const commitId = props.commit.commit_id?.trim()
    if (!commitId) {
      showToast({ variant: "error", title: "Commit ID 缺失" })
      return
    }

    const payload: CommitManualPayload = {
      commit_ancient_minutes_manual: toNumberOrNull(form.commit_ancient_minutes_manual),
      commit_ancient_minutes_reason_manual: form.commit_ancient_minutes_reason_manual.trim(),
      commit_real_minutes_manual: toNumberOrNull(form.commit_real_minutes_manual),
      commit_real_minutes_reason_manual: form.commit_real_minutes_reason_manual.trim(),
    }

    setForm("saving", true)
    try {
      await updateCommitManual(commitId, payload)
      showToast({ variant: "success", title: "人工调整已保存" })
      await props.onSaved?.()
      dialog.close()
    } catch (err) {
      showToast({
        variant: "error",
        title: "保存失败",
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setForm("saving", false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Modal
        title="Commit 人工调整"
        maxWidth="680px"
        footer={
          <>
            <Button variant="outline" size="sm" type="button" onClick={() => dialog.close()}>
              取消
            </Button>
            <Button size="sm" type="submit" disabled={form.saving}>
              {form.saving ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
        <div class="modal-section">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">传统开发时长预估（分钟）</label>
              <input class="modal-input" type="number" step="0.1" min="0" value={form.commit_ancient_minutes_manual} onInput={(e) => setForm("commit_ancient_minutes_manual", e.currentTarget.value)} />
            </div>
            <div class="modal-field">
              <label class="modal-label">实际耗时（分钟）</label>
              <input class="modal-input" type="number" step="0.1" min="0" value={form.commit_real_minutes_manual} onInput={(e) => setForm("commit_real_minutes_manual", e.currentTarget.value)} />
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="modal-field">
              <label class="modal-label">传统开发时长预估理由</label>
              <textarea class="modal-input" value={form.commit_ancient_minutes_reason_manual} onInput={(e) => setForm("commit_ancient_minutes_reason_manual", e.currentTarget.value)} />
            </div>
            <div class="modal-field">
              <label class="modal-label">实际耗时理由</label>
              <textarea class="modal-input" value={form.commit_real_minutes_reason_manual} onInput={(e) => setForm("commit_real_minutes_reason_manual", e.currentTarget.value)} />
            </div>
          </div>
        </div>
      </Modal>
    </form>
  )
}

export default function KanbanCommitDetail() {
  const params = useParams()
  const navigate = useNavigate()
  const dialog = useDialog()
  const [search] = useSearchParams<{ startDate?: string; endDate?: string; userName?: string; org1?: string; org2?: string; org3?: string; org4?: string }>()

  const commitId = createMemo(() => decodeURIComponent(params.commitId ?? "").trim())
  const listHref = createMemo(() => {
    const txt = searchQuery([
      ["startDate", search.startDate],
      ["endDate", search.endDate],
      ["userName", search.userName],
      ["org1", search.org1],
      ["org2", search.org2],
      ["org3", search.org3],
      ["org4", search.org4],
    ]).toString()
    return txt ? `/kanban/commit?${txt}` : "/kanban/commit"
  })

  const [data, { refetch }] = createResource(commitId, async (id) => {
    if (!id) return null
    try {
      return await getCommitDetail(id)
    } catch (err) {
      showToast({
        variant: "error",
        title: "Commit 详情加载失败",
        description: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  })

  const commit = createMemo(() => data()?.commit ?? {})
  const tasks = createMemo(() => data()?.related_tasks ?? [])
  const silica = createMemo(() => data()?.silica ?? commit().silica ?? null)
  const totalCost = createMemo(() => data()?.total_cost ?? commit().cost ?? null)
  const totalUp = createMemo(() => data()?.upstream_tokens ?? commit().upstream_tokens ?? 0)
  const totalDown = createMemo(() => data()?.downstream_tokens ?? commit().downstream_tokens ?? 0)
  const totalTokens = createMemo(() => totalUp() + totalDown())
  const repoLabel = createMemo(() => commit().repo_addr ? `${commit().repo_addr}${commit().repo_branch ? `#${commit().repo_branch}` : ""}` : "-")

  const realExplain = createMemo(() => {
    const reason = commit().commit_real_minutes_reason?.trim()
    if (reason) return reason
    if (!tasks().length) return "无关联 Task"
    return `Σ(Task 实际耗时 × 硅含量) = ${tasks().map((item) => `${formatDuration(item.task_real_minutes)} × ${item.silica == null ? "0%" : `${(item.silica * 100).toFixed(1)}%`}`).join(" + ")}`
  })

  const openManual = () => {
    if (!commit().commit_id) return
    dialog.show(() => <CommitManualDialog commit={commit()} onSaved={() => void refetch()} />)
  }

  return (
    <div class="flex min-h-full min-w-0 flex-col gap-5 overflow-y-auto overflow-x-clip p-[clamp(1rem,2vw,2rem)]">
      <div class="flex w-full flex-col gap-5">
        <header class="flex w-full flex-col gap-3">
          <Back href={listHref()} label="返回 Commit 列表" />

          <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 class="m-0 font-[var(--native-font-display)] text-[1.875rem] leading-[1.02] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">Commit 详情</h1>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={openManual} disabled={!commit().commit_id}>人工调整</Button>
            </div>
          </div>
        </header>

        <Show when={!data.loading} fallback={<div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">Commit 详情加载中...</div>}>
          <Show when={data()} fallback={<div class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] px-4 py-10 text-sm text-[var(--native-muted)] shadow-[var(--native-shadow-sm)]">没有查询到 Commit 详情</div>}>
            <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] p-4 shadow-[var(--native-shadow-sm)]">
              <div class="text-[1rem] font-semibold text-[var(--native-foreground)]">基础信息</div>
              <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">Commit ID</div><div class="mt-1 break-all text-sm text-[var(--native-foreground)]">{text(commit().commit_id)}</div></div>
                <div>
                  <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">用户</div>
                  <div class="mt-1 text-sm text-[var(--native-foreground)]">
                    <Show when={commit().user_id?.trim()} fallback={text(commit().user_name)}>
                      <button type="button" class="text-left text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/user/${encodeURIComponent(commit().user_id!.trim())}`)}>
                        {commit().user_name || commit().user_id}
                      </button>
                    </Show>
                  </div>
                </div>
                <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">Git 用户</div><div class="mt-1 break-all text-sm text-[var(--native-foreground)]">{text(commit().git_user_name ? `${commit().git_user_name} <${commit().git_user_email || ""}>` : "")}</div></div>
                <div>
                  <div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">仓库</div>
                  <div class="mt-1 text-sm text-[var(--native-foreground)]">
                    <Show when={commit().repo_addr?.trim()} fallback={repoLabel()}>
                      <button
                        type="button"
                        class="text-left break-all text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]"
                        onClick={() => navigate(commit().repo_branch?.trim() ? `/kanban/repo/${encodeURIComponent(commit().repo_addr!.trim())}/${encodeURIComponent(commit().repo_branch!.trim())}` : `/kanban/repo/${encodeURIComponent(commit().repo_addr!.trim())}`)}
                      >
                        {repoLabel()}
                      </button>
                    </Show>
                  </div>
                </div>
                <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">分支</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{text(commit().repo_branch)}</div></div>
                <div><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">提交时间</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{formatLocalTime(commit().commit_time)}</div></div>
                <div class="md:col-span-2 xl:col-span-3"><div class="text-[11px] uppercase tracking-[0.12em] text-[var(--native-dim)]">提交说明</div><div class="mt-1 text-sm text-[var(--native-foreground)]">{text(commit().comment)}</div></div>
              </div>
            </section>

            <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="生成代码量" value={commit().diff_lines == null ? "-" : `${commit().diff_lines} 行`} accent="var(--native-warning)" />
              <MetricCard label="实际耗时" value={formatDuration(commit().commit_real_minutes_manual ?? commit().commit_real_minutes)} hint={realExplain()} accent="var(--native-primary)" />
              <MetricCard label="传统开发时长预估" value={formatDuration(commit().commit_ancient_minutes_manual ?? commit().commit_ancient_minutes)} accent="var(--native-success)" />
              <MetricCard label="总 Tokens" value={totalTokens() > 0 ? totalTokens().toLocaleString() : "-"} hint={`上行 ${totalUp().toLocaleString()} / 下行 ${totalDown().toLocaleString()}`} accent="var(--native-warning)" />
              <MetricCard label="费用" value={fmtCost(totalCost())} accent="var(--native-warning)" />
              <article class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_oklab,var(--native-panel)_88%,var(--native-bg-subtle))] p-4 shadow-[var(--native-shadow-sm)]">
                <p class="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:color-mix(in_oklab,var(--native-success)_72%,var(--native-dim))]">提效比 / 硅含量</p>
                <div class="mt-3 flex flex-wrap items-center gap-3">
                  <RatioPill value={commit().efficiency_ratio} digits={0} />
                  <div class="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_oklab,var(--native-success)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--native-success)_10%,var(--native-panel))] px-3 py-1.5 text-sm font-medium text-[var(--native-foreground)]">
                    <span>{silica() == null ? "-" : `${silica()!.toFixed(1)}%`}</span>
                    <Tooltip value="commit 中由 AI Task 生成的代码占比，基于关联 Task diff 行数加权计算。" placement="top">
                      <span class="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border text-[10px] text-[var(--native-muted)]">?</span>
                    </Tooltip>
                  </div>
                </div>
              </article>
            </section>

            <section class="rounded-[var(--native-radius-lg)] border border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] bg-[var(--native-panel)] shadow-[var(--native-shadow-sm)]">
              <div class="border-b border-[color:color-mix(in_oklab,var(--native-border)_24%,transparent)] px-4 py-3 text-[1rem] font-semibold text-[var(--native-foreground)]">关联 Tasks</div>
              <div class="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="min-w-[140px]">Task ID</TableHead>
                      <TableHead class="min-w-[100px]">用户</TableHead>
                      <TableHead class="min-w-[160px]">开始时间</TableHead>
                      <TableHead class="min-w-[100px] text-right">代码行数</TableHead>
                      <TableHead class="min-w-[110px] text-right">实际耗时</TableHead>
                      <TableHead class="min-w-[110px] text-center">硅含量</TableHead>
                      <TableHead class="min-w-[100px] text-right">费用</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <Show when={tasks().length > 0} fallback={<TableRow><TableCell colspan={7} class="py-10 text-center text-sm text-[var(--native-muted)]">暂无关联 Task</TableCell></TableRow>}>
                      <For each={tasks()}>
                        {(row) => (
                          <TableRow>
                            <TableCell>
                              <button type="button" class="text-left text-sm text-[var(--native-primary)] transition-colors hover:text-[var(--native-foreground)]" onClick={() => navigate(`/kanban/task/${encodeURIComponent(row.task_id || "")}`)}>
                                {row.task_id || "-"}
                              </button>
                            </TableCell>
                            <TableCell>{row.user_name || "-"}</TableCell>
                            <TableCell>{formatLocalTime(row.start_time)}</TableCell>
                            <TableCell class="text-right tabular-nums">{row.diff_lines ?? "-"}</TableCell>
                            <TableCell class="text-right">{formatDuration(row.task_real_minutes)}</TableCell>
                            <TableCell class="text-center">
                              <div class="inline-flex min-w-[4.5rem] items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--native-primary)_22%,transparent)] bg-[color:color-mix(in_oklab,var(--native-primary)_10%,var(--native-panel))] px-2 py-1 text-xs font-medium text-[var(--native-foreground)]">
                                {row.silica == null ? "-" : `${(row.silica * 100).toFixed(1)}%`}
                              </div>
                            </TableCell>
                            <TableCell class="text-right tabular-nums">{fmtCost(row.cost)}</TableCell>
                          </TableRow>
                        )}
                      </For>
                    </Show>
                  </TableBody>
                </Table>
              </div>
            </section>
          </Show>
        </Show>
      </div>
    </div>
  )
}