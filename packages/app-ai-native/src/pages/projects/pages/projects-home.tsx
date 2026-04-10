import { useNavigate } from "@solidjs/router"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { TextField, TextFieldInput } from "@/components/ui/text-field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLanguage } from "@/context/language"
import { showToast } from "@opencode-ai/ui/toast"
import { createMemo, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { projectsApi } from "../lib/project-api"
import CreateProjectDialog from "../components/create-project-dialog"
import type { Project, ProjectBasicInfo, ProjectInvitation } from "../lib/project-types"

function formatDate(iso?: string) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function ProjectsHome() {
  const dialog = useDialog()
  const language = useLanguage()
  const navigate = useNavigate()
  const [state, setState] = createStore({ search: "", selectedInvitationId: "", respondingInvitationId: "" })
  const [localState, setLocalState] = createStore({ appendedProjects: [] as Project[] })
  const [projects, { refetch }] = createResource(async () => {
    try {
      return await projectsApi.list()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  const [myInvitations, { refetch: refetchMyInvitations }] = createResource(async () => {
    const res = await projectsApi.listMyInvitations()
    return res.invitations ?? []
  })
  const [userInfos, { refetch: refetchUserInfos }] = createResource(
    () => (myInvitations() ?? []).flatMap((item) => [item.inviterId, item.inviteeId]),
    async (userIds) => projectsApi.resolveUserInfo(userIds),
  )
  const [projectBasics, { refetch: refetchProjectBasics }] = createResource(
    () => (myInvitations() ?? []).map((item) => item.projectId),
    async (projectIds) => projectsApi.resolveProjectBasicInfo(projectIds),
  )

  const rows = createMemo(() => {
    const base = projects() ?? []
    const items = [...localState.appendedProjects.filter((project) => !base.some((item) => item.id === project.id)), ...base]
    const keyword = state.search.trim().toLowerCase()
    if (!keyword) return items
    return items.filter(
      (project) =>
        project.name.toLowerCase().includes(keyword) ||
        (project.description ?? "").toLowerCase().includes(keyword) ||
        project.id.toLowerCase().includes(keyword),
    )
  })
  const pinnedProjects = createMemo(() => rows().filter((project) => project.isPinned))
  const pinnedProjectsAll = createMemo(() => (projects() ?? []).filter((project) => project.isPinned))
  const pendingInvitations = createMemo(() => (myInvitations() ?? []).filter((item) => item.status === "pending"))
  const invitationProjectMap = createMemo(() => {
    const map = new Map<string, Project>()
    for (const project of rows()) map.set(project.id, project)
    return map
  })
  const selectedInvitation = createMemo(() =>
    pendingInvitations().find((item) => item.id === state.selectedInvitationId) ?? null,
  )

  const openCreateProject = () => {
    dialog.show(() =>
      <CreateProjectDialog
        onCreated={(project) => {
          setLocalState("appendedProjects", (items) => [project, ...items.filter((item) => item.id !== project.id)])
        }}
      />,
    )
  }

  const projectForInvitation = (invitation: ProjectInvitation): Pick<ProjectBasicInfo, "id" | "name" | "description"> | undefined => {
    if (invitation.projectName) {
      return { id: invitation.projectId, name: invitation.projectName, description: undefined }
    }
    const basic = projectBasics()?.[invitation.projectId]
    if (basic) return basic
    const project = invitationProjectMap().get(invitation.projectId)
    if (!project) return undefined
    return { id: project.id, name: project.name, description: project.description }
  }

  const handleInvitationResponse = async (invitationId: string, accept: boolean) => {
    setState("respondingInvitationId", invitationId)
    try {
      await projectsApi.respondInvitation(invitationId, { accept })
      await Promise.all([refetchMyInvitations(), refetch(), refetchUserInfos(), refetchProjectBasics()])
      if (state.selectedInvitationId === invitationId) {
        setState("selectedInvitationId", "")
      }
      showToast({
        variant: "success",
        title: accept ? language.t("projects.invitationPanel.toast.accepted") : language.t("projects.invitationPanel.toast.rejected"),
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setState("respondingInvitationId", "")
    }
  }

  const togglePin = async (project: Project) => {
    try {
      await projectsApi.setPin(project.id, !project.isPinned)
      await refetch()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const userName = (userId: string) => userInfos()?.[userId]?.name ?? userId

  return (
    <div class="projects-page">
      <header class="projects-page-header">
        <div>
          <h1 class="store-page-title">{language.t("projects.home.hero.title")}</h1>
          <p class="store-page-description">{language.t("projects.home.hero.description")}</p>
        </div>
      </header>

      <div class="projects-page-main">
        <section class="projects-top-panels">
          <div class="projects-pinned-shell">
            <div class="projects-panel-header">
              <div>
                <h2 class="store-section-title">{language.t("projects.home.pinned.title")}</h2>
                <p class="store-section-subtitle">{language.t("projects.home.pinned.description")}</p>
              </div>
            </div>
            <Show when={pinnedProjectsAll().length > 0} fallback={<div class="store-table-state">{language.t("projects.home.pinned.empty")}</div>}>
              <div class="projects-pinned-list">
                <For each={pinnedProjectsAll()}>
                  {(project) => (
                    <article class="projects-pinned-card">
                      <div>
                        <h3 class="projects-pinned-card-title">{project.name}</h3>
                        <p class="projects-pinned-card-desc">{project.description || "—"}</p>
                      </div>
                      <div class="projects-pinned-card-actions flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/projects/${project.id}`)}>
                          {language.t("projects.home.table.open")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void togglePin(project)}>
                          {language.t("projects.home.pinned.unpin")}
                        </Button>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <div class="projects-invitations-shell">
            <div class="projects-panel-header">
              <div>
                <h2 class="store-section-title">{language.t("projects.invitationPanel.title")}</h2>
                <p class="store-section-subtitle">{language.t("projects.invitationPanel.description")}</p>
              </div>
            </div>
            <Show when={pendingInvitations().length > 0} fallback={<div class="store-table-state">{language.t("projects.invitationPanel.empty")}</div>}>
              <div class="projects-invitation-list">
                <For each={pendingInvitations()}>
                  {(invitation) => (
                    <button
                      type="button"
                      class="projects-invitation-item"
                      onClick={() => setState("selectedInvitationId", invitation.id)}
                    >
                      <div class="projects-invitation-item-main min-w-0">
                        <div class="projects-invitation-item-title truncate">{projectForInvitation(invitation)?.name || invitation.projectId}</div>
                      </div>
                      <div class="projects-invitation-item-actions" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-7 w-7 min-w-7 p-0"
                          disabled={state.respondingInvitationId === invitation.id}
                          title={language.t("projects.invitationPanel.accept")}
                          onClick={() => void handleInvitationResponse(invitation.id, true)}
                        >
                          <Icon name="check" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-7 w-7 min-w-7 p-0"
                          disabled={state.respondingInvitationId === invitation.id}
                          title={language.t("projects.invitationPanel.reject")}
                          onClick={() => void handleInvitationResponse(invitation.id, false)}
                        >
                          <Icon name="close" />
                        </Button>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </section>

        <section class="projects-list-shell store-content-shell">
          <div class="store-section-heading">
            <div>
              <h2 class="store-section-title">{language.t("projects.nav.title")}</h2>
              <p class="store-section-subtitle">{language.t("projects.home.hero.description")}</p>
            </div>
            <div class="flex items-center gap-2">
              <TextField class="projects-search-field">
                <TextFieldInput
                  type="search"
                  value={state.search}
                  placeholder={language.t("projects.home.searchPlaceholder")}
                  onInput={(e: InputEvent) => setState("search", (e.currentTarget as HTMLInputElement).value)}
                  class="h-8 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </TextField>
              <Button class="h-8" onClick={openCreateProject}>
                {language.t("projects.home.createButton")}
              </Button>
            </div>
          </div>

          <div class="store-table-shell projects-table-shell">
            <Show when={!projects.loading} fallback={<div class="store-table-state">{language.t("store.loading")}</div>}>
              <Table class="store-data-table">
                <TableHeader>
                    <TableRow class="store-data-table-head-row">
                      <TableHead>{language.t("projects.home.table.name")}</TableHead>
                      <TableHead>{language.t("projects.home.table.description")}</TableHead>
                      <TableHead>{language.t("projects.editDialog.field.enabledAt")}</TableHead>
                      <TableHead>{language.t("projects.detail.archivedAtLabel")}</TableHead>
                      <TableHead class="store-col-updated">{language.t("projects.home.table.created")}</TableHead>
                      <TableHead class="store-col-action text-right">{language.t("projects.home.table.action")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                  <Show
                    when={rows().length > 0}
                    fallback={
                      <TableEmptyState
                        colSpan={6}
                        message={projects.error instanceof Error ? projects.error.message : language.t("projects.home.empty")}
                      />
                    }
                  >
                    <For each={rows()}>
                      {(project) => (
                        <TableRow class="store-data-table-row cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
                          <TableCell>
                            <span class="store-item-name">{project.name}</span>
                          </TableCell>
                          <TableCell class="store-data-table-muted">{project.description || "—"}</TableCell>
                          <TableCell class="store-data-table-muted">{formatDate(project.enabledAt)}</TableCell>
                          <TableCell class="store-data-table-muted">{formatDate(project.archivedAt)}</TableCell>
                          <TableCell class="store-col-updated store-data-table-muted">{formatDate(project.createdAt)}</TableCell>
                          <TableCell class="store-col-action text-right" onClick={(e: MouseEvent) => e.stopPropagation()}>
                            <div class="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => void togglePin(project)}>
                                {project.isPinned ? language.t("projects.home.table.unpin") : language.t("projects.home.table.pin")}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${project.id}`)}>
                                {language.t("projects.home.table.open")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </For>
                  </Show>
                </TableBody>
              </Table>
            </Show>
          </div>
        </section>
      </div>

      <Sheet open={!!selectedInvitation()} onOpenChange={(open) => !open && setState("selectedInvitationId", "")} modal={false}>
        <SheetContent position="right" class="store-detail-sheet w-[min(32rem,92vw)] sm:max-w-none">
          <SheetHeader class="sr-only">
            <SheetTitle>{language.t("projects.invitationPanel.sheet.title")}</SheetTitle>
            <SheetDescription>{language.t("projects.invitationPanel.sheet.description")}</SheetDescription>
          </SheetHeader>
          <Show when={selectedInvitation()}>
            {(invitation) => {
              return (
                <div class="flex h-full flex-col gap-4 p-6">
                  <div>
                    <p class="store-page-kicker">{language.t("projects.invitationPanel.title")}</p>
                    <h2 class="store-page-title text-2xl">{projectForInvitation(invitation())?.name || invitation().projectId}</h2>
                    <p class="store-page-description">{projectForInvitation(invitation())?.description || invitation().message || "—"}</p>
                  </div>
                  <div class="rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
                    <div>{language.t("projects.invitationPanel.invitedBy")} {userName(invitation().inviterId)}</div>
                    <div>{language.t("projects.detail.members")}: {language.t(`projects.members.role.${invitation().role}`)}</div>
                    <div>{language.t("projects.home.table.updated")}: {formatDate(invitation().createdAt)}</div>
                  </div>
                  <div class="mt-auto flex items-center gap-2">
                    <Button
                      disabled={state.respondingInvitationId === invitation().id}
                      onClick={() => void handleInvitationResponse(invitation().id, true)}
                    >
                      {language.t("projects.invitationPanel.accept")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={state.respondingInvitationId === invitation().id}
                      onClick={() => void handleInvitationResponse(invitation().id, false)}
                    >
                      {language.t("projects.invitationPanel.reject")}
                    </Button>
                  </div>
                </div>
              )
            }}
          </Show>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function TableEmptyState(props: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={props.colSpan}>
        <div class="store-table-state">{props.message}</div>
      </TableCell>
    </TableRow>
  )
}
