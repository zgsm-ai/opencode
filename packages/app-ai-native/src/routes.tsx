import { Navigate, Route } from "@solidjs/router"
import { Component, lazy, Suspense, type JSX } from "solid-js"
import AuthGuard from "@/components/auth-guard"
import { PageLoadingSkeleton } from "@/components/page-loading-skeleton"
import { useAuth } from "@/context/auth"

const Loading = () => <PageLoadingSkeleton />

const RootLayout = lazy(() => import("@/pages/root-layout"))
const StoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreHome })))
const StoreManager = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreManager })))
const StoreDetail = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreDetail })))
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
const KanbanNeedList = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanNeedList })))
const KanbanNeedDetail = lazy(() => import("@/pages/kanban").then((m) => ({ default: m.KanbanNeedDetail })))
const WorkspaceLayout = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceLayout })))
const WorkspaceHome = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceHome })))
const MobileWorkspaceLayout = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.MobileWorkspaceLayout })))
const MobileWorkspaceHome = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.MobileWorkspaceHome })))
const MobileWorkspaceDetail = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.MobileWorkspaceDetail })))
const MobileStoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.MobileStoreLayout })))
const MobileStoreDetail = lazy(() => import("@/pages/store").then((m) => ({ default: m.MobileStoreDetail })))
const CapabilityEditorLayout = lazy(() => import("@/pages/capability-editor-layout"))
const consoleImport = import("@/pages/console")
const ConsoleLayout = lazy(() => consoleImport.then((m) => ({ default: m.ConsoleLayout })))
const ConsoleRepositories = lazy(() => consoleImport.then((m) => ({ default: m.DashboardRepositories })))
const ConsoleCapabilities = lazy(() => consoleImport.then((m) => ({ default: m.DashboardCapabilities })))
const CapabilityEditorPage = lazy(() => consoleImport.then((m) => ({ default: m.CapabilityEditorPage })))
const ConsoleDevices = lazy(() => consoleImport.then((m) => ({ default: m.DevicesPage })))
const ConsoleNotifications = lazy(() => consoleImport.then((m) => ({ default: m.NotificationsPage })))
const ConsoleUsage = lazy(() => consoleImport.then((m) => ({ default: m.UsagePage })))
const ConsoleKanban = lazy(() => consoleImport.then((m) => ({ default: m.DashboardKanban })))
const ConsoleIdentity = lazy(() => consoleImport.then((m) => ({ default: m.IdentityPage })))

const ConsoleDevicesRoute: Component = () => <ConsoleDevices />
const ConsoleNotificationsRoute: Component = () => <ConsoleNotifications />
const ConsoleKanbanRoute: Component = () => <ConsoleKanban />
const MulticaPage = lazy(() => import("@/pages/multica").then((m) => ({ default: m.MulticaPage })))


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
      { path: "/:workspaceID", component: WorkspaceLayout },
    ],
  },
  {
    path: "/m/store",
    component: MobileStoreLayout,
    auth: true,
    children: [
      { path: "/:itemId", component: MobileStoreDetail },
    ],
  },
  {
    path: "/m/workspace",
    component: MobileWorkspaceLayout,
    auth: true,
    children: [
      { path: "/", component: MobileWorkspaceHome },
      { path: "/:workspaceID", component: MobileWorkspaceDetail },
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
    menu: "kanban",
    children: [
      { path: "/", component: KanbanHome },
      { path: "/need", component: KanbanNeedList },
      { path: "/need/:needId", component: KanbanNeedDetail },
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
      { path: "/usage", component: ConsoleUsage },
      { path: "/identity", component: ConsoleIdentity },
    ],
  },
  {
    path: "/store",
    component: StoreLayout,
    auth: true,
    children: [
      { path: "/", component: StoreHome },
      { path: "/manager", component: StoreManager },
      { path: "/:itemId", component: StoreDetail },
    ],
  },
  {
    path: "/multica",
    component: MulticaPage,
    auth: true,
  },
]
