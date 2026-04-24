import { Navigate, Route } from "@solidjs/router"
import { Component, lazy, Suspense, type JSX } from "solid-js"
import { SessionRoute, SessionIndexRoute } from "@/app"
import AuthGuard from "@/components/auth-guard"
import { useAuth } from "@/context/auth"

const Loading = () => <div class="size-full" />

const RootLayout = lazy(() => import("@/pages/root-layout"))
const StoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreHome })))
const ProjectsLayout = lazy(() => import("@/pages/projects").then((m) => ({ default: m.ProjectsLayout })))
const ProjectsHome = lazy(() => import("@/pages/projects").then((m) => ({ default: m.ProjectsHome })))
const ProjectDetail = lazy(() => import("@/pages/projects").then((m) => ({ default: m.ProjectDetail })))
const KanbanLayout = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanLayout })))
const KanbanHome = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanHome })))
const KanbanRepoList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanRepoList })))
const KanbanRepoDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanRepoDetail })))
const KanbanUserList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanUserList })))
const KanbanUserDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanUserDetail })))
const KanbanUserGroupDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanUserGroupDetail })))
const KanbanOrgList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanOrgList })))
const KanbanOrgDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanOrgDetail })))
const KanbanTaskList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanTaskList })))
const KanbanTaskDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanTaskDetail })))
const KanbanCommitList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanCommitList })))
const KanbanCommitDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanCommitDetail })))
const KanbanWorkDirDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanWorkDirDetail })))
const KanbanProjectDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanProjectDetail })))
const KanbanProjectList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanProjectList })))
const WorkspaceLayout = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceLayout })))
const WorkspaceHome = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceHome })))
const CapabilityEditorLayout = lazy(() => import("@/pages/capability-editor-layout"))
const DirectoryLayout = lazy(() => import("@/pages/directory-layout"))
const consoleImport = import("@/pages/console")
const ConsoleLayout = lazy(() => consoleImport.then((m) => ({ default: m.ConsoleLayout })))
const ConsoleRepositories = lazy(() => consoleImport.then((m) => ({ default: m.DashboardRepositories })))
const ConsoleCapabilities = lazy(() => consoleImport.then((m) => ({ default: m.DashboardCapabilities })))
const CapabilityEditorPage = lazy(() => consoleImport.then((m) => ({ default: m.CapabilityEditorPage })))
const ConsoleDevices = lazy(() => consoleImport.then((m) => ({ default: m.DevicesPage })))
const ConsoleNotifications = lazy(() => consoleImport.then((m) => ({ default: m.NotificationsPage })))
const ConsoleKanban = lazy(() => consoleImport.then((m) => ({ default: m.DashboardKanban })))

const ConsoleDevicesRoute: Component = () => <ConsoleDevices />
const ConsoleNotificationsRoute: Component = () => <ConsoleNotifications />
const ConsoleKanbanRoute: Component = () => <ConsoleKanban />


const wrap = (Component: Component<{ children?: JSX.Element }>) => (props: { children?: JSX.Element }) => (
  <Suspense fallback={<Loading />}>
    <Component>{props.children}</Component>
  </Suspense>
)

const guard = (Component: Component<{ children?: JSX.Element }>) => (props: { children?: JSX.Element }) => (
  <Suspense fallback={<Loading />}>
    <AuthGuard>
      <Component>{props.children}</Component>
    </AuthGuard>
  </Suspense>
)

const MenuRoute: Component<{ code: string, children?: JSX.Element }> = (props) => {
  const auth = useAuth()
  if (!auth.canAccessMenu(props.code)) return <Navigate href="/store" />
  return props.children
}

const menu = (code: string, Component: Component<{ children?: JSX.Element }>) => (props: { children?: JSX.Element }) => (
  <Suspense fallback={<Loading />}>
    <AuthGuard>
      <MenuRoute code={code}>
        <Component>{props.children}</Component>
      </MenuRoute>
    </AuthGuard>
  </Suspense>
)

export const RootLayoutRoute: Component<{ children?: JSX.Element }> = (props) => (
  <Suspense fallback={<Loading />}>
    <RootLayout>{props.children}</RootLayout>
  </Suspense>
)

interface RouteConfig {
  path: string
  component: Component<{ children?: JSX.Element }>
  auth?: boolean
  menu?: string
  children?: RouteConfig[]
}

export function renderRoutes(routes: RouteConfig[]) {
  return routes.map((r) => (
    <Route path={r.path} component={r.menu ? menu(r.menu, r.component) : r.auth ? guard(r.component) : wrap(r.component)}>
      {r.children ? renderRoutes(r.children) : null}
    </Route>
  ))
}

export const routeConfig: RouteConfig[] = [
  { path: "/", component: () => <Navigate href="/store" /> },
  {
    path: "/workspace",
    component: WorkspaceLayout,
    auth: true,
    children: [
      { path: "/", component: WorkspaceHome },
      {
        path: "/:workspaceID",
        component: DirectoryLayout,
        children: [
          { path: "/", component: SessionRoute },
          { path: "/:id", component: SessionRoute },
        ],
      },
    ],
  },
  {
    path: "/projects",
    component: ProjectsLayout,
    auth: true,
    children: [
      { path: "/", component: ProjectsHome },
      { path: "/:projectId", component: ProjectDetail },
    ],
  },
  {
    path: "/capabilities",
    component: CapabilityEditorLayout,
    auth: true,
    children: [
      { path: "/new", component: CapabilityEditorPage },
      { path: "/:itemId/edit", component: CapabilityEditorPage },
    ],
  },
  {
    path: "/kanban",
    component: KanbanLayout,
    auth: true,
    menu: "console.kanban",
    children: [
      { path: "/", component: KanbanHome },
      { path: "/repo", component: KanbanRepoList },
      { path: "/repo/:repoAddr", component: KanbanRepoDetail },
      { path: "/repo/:repoAddr/:repoBranch", component: KanbanRepoDetail },
      { path: "/user", component: KanbanUserList },
      { path: "/user/group/:groupId", component: KanbanUserGroupDetail },
      { path: "/user/:userId", component: KanbanUserDetail },
      { path: "/org", component: KanbanOrgList },
      { path: "/org/:orgPath", component: KanbanOrgDetail },
      { path: "/task", component: KanbanTaskList },
      { path: "/task/:taskId", component: KanbanTaskDetail },
      { path: "/commit", component: KanbanCommitList },
      { path: "/commit/:commitId", component: KanbanCommitDetail },
      { path: "/workdir/:workDirId", component: KanbanWorkDirDetail },
      { path: "/project", component: KanbanProjectList },
      { path: "/project/:projectId", component: KanbanProjectDetail },
    ],
  },
  {
    path: "/console",
    component: ConsoleLayout,
    auth: true,
    children: [
      { path: "/", component: ConsoleRepositories },
      { path: "/capabilities", component: ConsoleCapabilities },
      { path: "/devices", component: ConsoleDevicesRoute },
      { path: "/notifications", component: ConsoleNotificationsRoute },
      { path: "/kanban", component: ConsoleKanbanRoute },
    ],
  },
  {
    path: "/store",
    component: StoreLayout,
    auth: true,
    children: [
      { path: "/", component: StoreHome },
    ],
  },
]
