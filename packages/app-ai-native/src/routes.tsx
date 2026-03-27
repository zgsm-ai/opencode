import { Navigate, Route } from "@solidjs/router"
import { Component, lazy, Suspense, type JSX } from "solid-js"
import { SessionRoute, SessionIndexRoute } from "@/app"

const Loading = () => <div class="size-full" />

const RootLayout = lazy(() => import("@/pages/root-layout"))
const StoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreHome })))
const StoreSkills = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreSkills })))
const StoreSubagents = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreSubagents })))
const StoreCommands = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreCommands })))
const StoreMcpServers = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreMcpServers })))
const StoreItemDetail = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreItemDetail })))
const WorkspaceLayout = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceLayout })))
const WorkspaceHome = lazy(() => import("@/pages/workspace").then((m) => ({ default: m.WorkspaceHome })))
const DirectoryLayout = lazy(() => import("@/pages/directory-layout"))
const StoreDashboard = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreDashboard })))

const wrap = (Component: Component<{ children?: JSX.Element }>) => (props: { children?: JSX.Element }) => (
  <Suspense fallback={<Loading />}>
    <Component>{props.children}</Component>
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
  children?: RouteConfig[]
}

export function renderRoutes(routes: RouteConfig[]) {
  return routes.map((r) => (
    <Route path={r.path} component={wrap(r.component)}>
      {r.children ? renderRoutes(r.children) : null}
    </Route>
  ))
}

export const routeConfig: RouteConfig[] = [
  { path: "/", component: () => <Navigate href="/workspace" /> },
  {
    path: "/workspace",
    component: WorkspaceLayout,
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
    children: [
      { path: "/", component: StoreHome },
      { path: "/skills", component: StoreSkills },
      { path: "/subagents", component: StoreSubagents },
      { path: "/commands", component: StoreCommands },
      { path: "/mcp-servers", component: StoreMcpServers },
      { path: "/items/:id", component: StoreItemDetail },
      { path: "/dashboard", component: StoreDashboard },
    ],
  },
]
