import { Navigate, Route } from "@solidjs/router"
import { Component, lazy, Suspense, type JSX } from "solid-js"
import { SessionRoute, SessionIndexRoute } from "@/app"
import AuthGuard from "@/components/auth-guard"

const Loading = () => <div class="size-full" />

const RootLayout = lazy(() => import("@/pages/root-layout"))
const StoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreHome })))
const ProjectsLayout = lazy(() => import("@/pages/projects").then((m) => ({ default: m.ProjectsLayout })))
const ProjectsHome = lazy(() => import("@/pages/projects").then((m) => ({ default: m.ProjectsHome })))
const ProjectDetail = lazy(() => import("@/pages/projects").then((m) => ({ default: m.ProjectDetail })))
const WorkspaceLayout = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceLayout })))
const WorkspaceHome = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceHome })))
const DirectoryLayout = lazy(() => import("@/pages/directory-layout"))
const consoleImport = import("@/pages/console")
const ConsolePage = lazy(() => consoleImport.then((m) => ({ default: m.ConsolePage })))

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

export const RootLayoutRoute: Component<{ children?: JSX.Element }> = (props) => (
  <Suspense fallback={<Loading />}>
    <RootLayout>{props.children}</RootLayout>
  </Suspense>
)

interface RouteConfig {
  path: string
  component: Component<{ children?: JSX.Element }>
  auth?: boolean
  children?: RouteConfig[]
}

export function renderRoutes(routes: RouteConfig[]) {
  return routes.map((r) => (
    <Route path={r.path} component={r.auth ? guard(r.component) : wrap(r.component)}>
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
        path: "/:workspaceID/:dir",
        component: DirectoryLayout,
        children: [
          { path: "/", component: SessionIndexRoute },
          { path: "/session/:id?", component: SessionRoute },
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
    path: "/console",
    component: ConsolePage,
    auth: true,
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
