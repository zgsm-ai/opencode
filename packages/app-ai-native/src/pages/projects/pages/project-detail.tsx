import { A, useParams } from "@solidjs/router"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { JSX } from "solid-js"
import AvatarDisplay from "@/components/avatar-display"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import EditProjectDialog from "../components/edit-project-dialog"
import ProjectInviteDialog from "../components/project-invite-dialog"
import ProjectRepositoryBindingsDrawer from "../components/project-repository-bindings-drawer"
import { projectsApi } from "../lib/project-api"
import { cn } from "@/lib/utils"
import { st, sx } from "@/pages/store/lib/styles"

type DetailTabKey = "activity" | "members" | "invitations"

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

const MAX_VISIBLE_SHARED_USERS = 5
const SPARKLINE_DAYS = 30

function createEmptyDailyActivity() {
  const today = new Date()
  return Array.from({ length: SPARKLINE_DAYS }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (SPARKLINE_DAYS - 1 - index))
    return {
      date: date.toISOString().slice(0, 10),
      requestCount: 0,
    }
  })
}

function buildSparklinePoints(values: number[], width: number, height: number, padding = 4) {
  const max = Math.max(...values, 1)
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2
  return values.map((value, index) => ({
    x: padding + (values.length <= 1 ? usableWidth / 2 : (usableWidth / (values.length - 1)) * index),
    y: padding + usableHeight - (value / max) * usableHeight,
  }))
}

function buildSparklinePath(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
}

export default function ProjectDetail() {
  const params = useParams()
  const dialog = useDialog()
  const language = useLanguage()
  const auth = useAuth()
  const [state, setState] = createStore({
    detailTab: "activity" as DetailTabKey,
    settingsOpen: false,
    repositoryBindingsOpen: false,
  })

  const [project, { refetch }] = createResource(() => params.projectId, async (id) => {
    try {
      return await projectsApi.get(id)
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  const currentUserId = createMemo(() => auth.user()?.id || auth.user()?.subjectId || auth.user()?.sub || "")
  const userInfo = (userId: string) => project()?.users[userId]
  const userName = (userId: string) => userInfo(userId)?.name ?? userId
  const userAvatar = (userId: string) => userInfo(userId)?.avatarUrl

  const currentUserRole = createMemo(() => {
    const item = project()
    const userId = currentUserId()
    if (!item || !userId) return "—"
    if (item.project.creatorId === userId) return language.t("projects.members.role.owner")
    const member = item.members.find((entry) => entry.userId === userId)
    if (!member) return "—"
    return language.t(`projects.members.role.${member.role}`)
  })

  const canManageProject = createMemo(() => {
    const role = currentUserRole()
    return role === language.t("projects.members.role.owner") || role === language.t("projects.members.role.admin")
  })
  const isArchived = createMemo(() => !!project()?.project.archivedAt)
  const canInviteMembers = createMemo(() => canManageProject() && !isArchived())
  const canManageRepositories = createMemo(() => canManageProject())

  const togglePin = async () => {
    const current = project()
    if (!current) return
    try {
      await projectsApi.setPin(current.project.id, !current.project.isPinned)
      await refetch()
      showToast({
        variant: "success",
        title: current.project.isPinned
          ? language.t("projects.detail.toast.unpinned")
          : language.t("projects.detail.toast.pinned"),
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const openInviteDialog = () => {
    const current = project()
    if (!current) return
    dialog.show(() => (
      <ProjectInviteDialog projectId={current.project.id} currentUserId={currentUserId()} onInvited={() => void refetch()} />
    ))
  }

  const openEditDialog = () => {
    setState("settingsOpen", true)
  }

  return (
    <div class="projects-page project-detail-page">
      <Show when={project()}>
        {(item) => (
          <>
            <EditProjectDialog
              open={state.settingsOpen}
              onOpenChange={(open) => setState("settingsOpen", open)}
              project={item().project}
              canManage={canManageProject()}
              onSaved={() => void refetch()}
            />
            <ProjectRepositoryBindingsDrawer
              open={state.repositoryBindingsOpen}
              onOpenChange={(open) => setState("repositoryBindingsOpen", open)}
              projectId={item().project.id}
              repositories={item().repositories}
              canManage={canManageRepositories() && !isArchived()}
              resolveUserName={userName}
              onChanged={() => void refetch()}
            />
          </>
        )}
      </Show>
      <Show when={!project.loading} fallback={<div class={sx.state}>{language.t("store.loading")}</div>}>
        <Show when={project()} fallback={<div class={sx.state}>{language.t("projects.detail.empty")}</div>}>
          {(item) => (
            <div class="projects-page-main project-detail-main gap-6">
              <header class="projects-page-header project-detail-header space-y-4">
                <A href="/projects" class="inline-flex items-center gap-2 text-sm text-[var(--native-muted)] transition-colors hover:text-[var(--native-foreground)]">
                  <Icon name="chevron-left" />
                  {language.t("projects.detail.back")}
                </A>

                <div class="project-detail-header-bar flex items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div class="project-detail-header-info flex min-w-0 items-center gap-3">
                    <Show when={item().project.isPinned}>
                      <span class="project-detail-header-pin inline-flex items-center justify-center rounded-full bg-primary/10 p-2 text-primary" title={language.t("projects.detail.pinStatus.pinned")}>
                        <Icon name="sparkles" />
                      </span>
                    </Show>
                    <div class="project-detail-header-title-wrap min-w-0 flex items-center gap-3">
                      <div class="project-detail-header-title-row flex min-w-0 flex-wrap items-center gap-3">
                        <h1 class="project-detail-title text-[2.25rem] leading-[0.95] font-semibold tracking-[-0.05em] text-[var(--native-foreground)]">{item().project.name}</h1>
                        <span class={cn("project-detail-role-badge shrink-0", sx.badge)}>{currentUserRole()}</span>
                        <Show when={item().project.archivedAt}>
                          <span class={cn("project-detail-archived-badge shrink-0", sx.badge)}>{language.t("projects.detail.archivedBadge")}</span>
                        </Show>
                      </div>
                    </div>
                  </div>

                  <div class="project-detail-header-actions flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openInviteDialog}
                      disabled={!canInviteMembers()}
                      title={!canManageProject() ? language.t("projects.editDialog.permissionHint") : isArchived() ? language.t("projects.detail.archivedActionHint") : undefined}
                    >
                      {language.t("projects.actions.inviteMember")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void togglePin()}>
                      {item().project.isPinned
                        ? language.t("projects.actions.unpinProject")
                        : language.t("projects.actions.pinProject")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={openEditDialog} disabled={!canManageProject()} title={!canManageProject() ? language.t("projects.editDialog.permissionHint") : undefined}>
                      <Icon name="settings-gear" />
                      {language.t("projects.actions.projectSettings")}
                    </Button>
                  </div>
                </div>
              </header>

              <section class="project-detail-content flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
                <div class="project-detail-content-header shrink-0 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div class="project-detail-content-heading">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <h2 class="project-detail-content-title m-0 text-[1rem] font-bold text-[var(--native-foreground)]">{language.t("projects.detail.contentSectionTitle")}</h2>
                      <div class="project-detail-header-meta flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <Show when={item().project.enabledAt}>
                          <span class="project-detail-header-meta-item">
                            {language.t("projects.detail.enabledAtLabel")}: {formatDate(item().project.enabledAt)}
                          </span>
                        </Show>
                        <Show when={item().project.archivedAt}>
                          <span class="project-detail-header-meta-item">
                            {language.t("projects.detail.archivedAtLabel")}: {formatDate(item().project.archivedAt)}
                          </span>
                        </Show>
                      </div>
                    </div>
                    <p class="project-detail-content-subtitle mt-0.5 text-[0.8125rem] text-[var(--native-muted)]">{language.t("projects.detail.contentSectionDescription")}</p>
                  </div>
                  <div class={cn("project-detail-tabs", sx.tabs)} role="tablist" aria-label={language.t("projects.detail.contentSectionTitle")}>
                    <For each={["activity", "members", "invitations"] as const}>
                      {(tab) => (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={state.detailTab === tab}
                          class={st.tab(state.detailTab === tab)}
                          onClick={() => {
                            setState("detailTab", tab)
                          }}
                        >
                          {language.t(`projects.detail.tab.${tab}`)}
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                <div class="project-detail-tab-panels min-h-0 flex-1 overflow-hidden">
                  <Show when={state.detailTab === "activity"}>
                    <div class="project-detail-tab-panel project-detail-tab-panel-activity flex h-full min-h-0 flex-1 flex-col overflow-hidden">
                      <div class="project-detail-bound-repositories flex min-h-0 flex-1 flex-col p-4">
                        <div class="project-detail-bound-repositories-header mb-3 shrink-0 flex items-center justify-between gap-4">
                          <div class="project-detail-bound-repositories-heading">
                            <h3 class="project-detail-bound-repositories-title m-0 text-[1rem] font-bold text-[var(--native-foreground)]">{language.t("projects.detail.boundRepositoriesTitle")}</h3>
                            <p class="project-detail-bound-repositories-subtitle mt-0.5 text-[0.8125rem] text-[var(--native-muted)]">{language.t("projects.detail.boundRepositoriesDescription")}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canManageRepositories() || isArchived()}
                            title={!canManageRepositories() ? language.t("projects.editDialog.permissionHint") : isArchived() ? language.t("projects.detail.archivedActionHint") : undefined}
                            onClick={() => setState("repositoryBindingsOpen", true)}
                          >
                            {language.t("projects.actions.manageRepositoryBindings")}
                          </Button>
                        </div>
                        <Show
                          when={item().activity.repositories.length > 0}
                          fallback={
                            <div class="flex min-h-0 flex-1 items-center justify-center">
                              <div class="max-w-sm text-center">
                                <div class="text-[1rem] font-semibold text-foreground">
                                  {language.t("projects.detail.emptyRepositories")}
                                </div>
                                <p class="mt-2 text-sm text-muted-foreground">
                                  {language.t("projects.detail.emptyActivityGuide")}
                                </p>
                              </div>
                            </div>
                          }
                        >
                          <div class="project-detail-activity-list flex min-h-0 flex-1 flex-col overflow-auto space-y-6">
                            <For each={item().activity.repositories}>
                              {(repo) => (
                                <div class="project-detail-activity-repo p-4">
                                  <div class="project-detail-activity-repo-header project-detail-activity-repo-layout">
                                    <div class="project-detail-activity-repo-info min-w-0">
                                      <div class="project-detail-activity-repo-label text-xs text-muted-foreground">
                                        {language.t("projects.detail.repositoryInfo")}
                                      </div>
                                      <h3 class="project-detail-activity-repo-title m-0 truncate text-[1rem] font-bold text-[var(--native-foreground)]">{repo.displayName || repo.gitRepoUrl}</h3>
                                      <p class="project-detail-activity-repo-subtitle mt-0.5 truncate text-[0.8125rem] text-[var(--native-muted)]">{repo.gitRepoUrl}</p>
                                    </div>

                                    <div class="project-detail-activity-shared-users min-w-0">
                                      <div class="project-detail-activity-repo-label text-xs text-muted-foreground">
                                        {language.t("projects.detail.sharedUsers")}
                                      </div>
                                      <div class="project-detail-activity-shared-users-row">
                                        <For each={repo.activeMembers.slice().sort((a, b) => b.requestCount - a.requestCount).slice(0, MAX_VISIBLE_SHARED_USERS)}>
                                          {(activity) => (
                                            <Tooltip value={userName(activity.userId)} placement="top">
                                              <div class="project-detail-activity-user-avatar-wrap">
                                                <AvatarDisplay
                                                  avatarUrl={userAvatar(activity.userId)}
                                                  username={userName(activity.userId)}
                                                  class="project-detail-activity-user-avatar"
                                                />
                                              </div>
                                            </Tooltip>
                                          )}
                                        </For>
                                        <Show when={repo.activeMembers.length > MAX_VISIBLE_SHARED_USERS}>
                                          <div
                                            class="project-detail-activity-user-avatar project-detail-activity-user-avatar-overflow"
                                            title={repo.activeMembers
                                              .slice()
                                              .sort((a, b) => b.requestCount - a.requestCount)
                                              .slice(MAX_VISIBLE_SHARED_USERS)
                                              .map((activity) => userName(activity.userId))
                                              .join(", ")}
                                          >
                                            ...
                                          </div>
                                        </Show>
                                      </div>
                                    </div>

                                    <RepositoryActivitySparkline
                                      repoKey={repo.repositoryId || repo.gitRepoUrl}
                                      totalRequests={repo.totalRequests}
                                      dailyRequests={repo.dailyRequests}
                                      language={language}
                                    />
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </Show>

                  <Show when={state.detailTab === "members"}>
                    <div class="project-detail-tab-panel project-detail-tab-panel-members flex h-full min-h-0 flex-col">
                      <DetailTable
                        headers={[
                          language.t("projects.home.table.name"),
                          language.t("projects.detail.members"),
                          language.t("projects.detail.joinedAt"),
                        ]}
                        rows={item().members.map((member) => [
                          <UserIdentityCell name={userName(member.userId)} avatarUrl={userAvatar(member.userId)} />,
                          language.t(`projects.members.role.${member.role}`),
                          formatDate(member.joinedAt),
                        ])}
                        emptyMessage={language.t("projects.detail.emptyMembers")}
                      />
                    </div>
                  </Show>

                  <Show when={state.detailTab === "invitations"}>
                    <div class="project-detail-tab-panel project-detail-tab-panel-invitations flex h-full min-h-0 flex-col">
                      <DetailTable
                        headers={[
                          language.t("projects.detail.invitee"),
                          language.t("projects.detail.members"),
                          language.t("projects.detail.status"),
                          language.t("projects.detail.invitedBy"),
                          language.t("projects.home.table.created"),
                        ]}
                        rows={item().invitations.map((invite) => [
                          <UserIdentityCell name={userName(invite.inviteeId)} avatarUrl={userAvatar(invite.inviteeId)} />,
                          language.t(`projects.members.role.${invite.role}`),
                          invitationStatusLabel(language, invite.status),
                          <UserIdentityCell name={userName(invite.inviterId)} avatarUrl={userAvatar(invite.inviterId)} />,
                          formatDate(invite.createdAt),
                        ])}
                        emptyMessage={language.t("projects.detail.emptyInvitations")}
                      />
                    </div>
                  </Show>
                </div>
              </section>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

function invitationStatusLabel(language: ReturnType<typeof useLanguage>, status: string) {
  const key = `projects.invitations.status.${status}`
  const translated = language.t(key)
  return translated === key ? status : translated
}

function DetailTable(props: { headers: string[]; rows: JSX.Element[][]; emptyMessage?: string }) {
  return (
    <div class={cn("project-detail-table flex h-full min-h-0 flex-1 flex-col overflow-auto", sx.tableShell)}>
      <Table class="project-detail-table-inner">
        <TableHeader>
          <TableRow class="project-detail-table-head-row">
            <For each={props.headers}>{(header) => <TableHead class="project-detail-table-head-cell">{header}</TableHead>}</For>
          </TableRow>
        </TableHeader>
        <TableBody>
          <Show when={props.rows.length > 0} fallback={<TableEmptyState colSpan={props.headers.length} message={props.emptyMessage ?? "—"} />}>
            <For each={props.rows}>
              {(row) => (
                <TableRow class="project-detail-table-row">
                  <For each={row}>{(cell) => <TableCell class="project-detail-table-cell">{cell}</TableCell>}</For>
                </TableRow>
              )}
            </For>
          </Show>
        </TableBody>
      </Table>
    </div>
  )
}

function UserIdentityCell(props: { name: string; avatarUrl?: string }) {
  return (
    <div class="flex min-w-0 items-center gap-2">
      <AvatarDisplay avatarUrl={props.avatarUrl} username={props.name} class="size-7 shrink-0" />
      <span class="truncate">{props.name}</span>
    </div>
  )
}

function TableEmptyState(props: { colSpan: number; message: string }) {
  return (
    <TableRow class="project-detail-table-empty-row">
      <TableCell class="project-detail-table-empty-cell" colSpan={props.colSpan}>
        <div class={cn("project-detail-table-empty", sx.state)}>{props.message}</div>
      </TableCell>
    </TableRow>
  )
}

function RepositoryActivitySparkline(props: {
  repoKey: string
  totalRequests: number
  dailyRequests?: { date: string; requestCount: number }[]
  language: ReturnType<typeof useLanguage>
}) {
  const width = 112
  const height = 36
  const series = createMemo(() => {
    if (props.dailyRequests && props.dailyRequests.length > 0) return props.dailyRequests
    return createEmptyDailyActivity()
  })
  const points = createMemo(() => buildSparklinePoints(series().map((item) => item.requestCount), width, height))
  const path = createMemo(() => buildSparklinePath(points()))

  return (
    <div class="project-detail-activity-chart shrink-0">
      <svg
        class="project-detail-activity-sparkline"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-label={props.language.t("projects.activity.last30Days")}
      >
        <path class="project-detail-activity-sparkline-line" d={path()} />
        <title>
          {series()
            .map((item) => `${formatDate(item.date)} ${props.language.t("projects.activity.requests")}: ${item.requestCount}`)
            .join(" | ")}
        </title>
      </svg>
    </div>
  )
}
