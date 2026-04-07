import { Navigate, Route } from "@solidjs/router"
import { Component, lazy, Suspense, type JSX } from "solid-js"
import { SessionRoute, SessionIndexRoute } from "@/app"
import AuthGuard from "@/components/auth-guard"

const Loading = () => <div class="size-full" />

const RootLayout = lazy(() => import("@/pages/root-layout"))
const StoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreHome })))
const WorkspaceLayout = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceLayout })))
const WorkspaceHome = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceHome })))
const DirectoryLayout = lazy(() => import("@/pages/directory-layout"))
const DashboardLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.DashboardLayout })))
const DashboardRepositories = lazy(() => import("@/pages/store").then((m) => ({ default: m.DashboardRepositories })))
const DashboardCapabilities = lazy(() => import("@/pages/store").then((m) => ({ default: m.DashboardCapabilities })))
const DashboardDevices = lazy(() => import("@/pages/store").then((m) => ({ default: m.DashboardDevices })))
const DashboardNotifications = lazy(() => import("@/pages/store").then((m) => ({ default: m.DashboardNotifications })))

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
  { path: "/", component: () => <Navigate href="/workspace" /> },
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
    path: "/store",
    component: StoreLayout,
    auth: true,
    children: [
      { path: "/", component: StoreHome },
      {
        path: "/dashboard",
        component: DashboardLayout,
        children: [
          { path: "/", component: () => <Navigate href="/store/dashboard/repositories" /> },
          { path: "/repositories", component: DashboardRepositories },
          { path: "/capabilities", component: DashboardCapabilities },
          { path: "/devices", component: DashboardDevices },
          { path: "/notifications", component: DashboardNotifications },
        ],
      },
    ],
  },
]
