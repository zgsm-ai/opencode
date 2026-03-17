import "@/index.css"
import { File } from "@opencode-ai/ui/file"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { Font } from "@opencode-ai/ui/font"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import { MetaProvider } from "@solidjs/meta"
import { BaseRouterProps, Navigate, Route, Router } from "@solidjs/router"
import { Component, ErrorBoundary, type JSX, lazy, type ParentProps, Show, Suspense } from "solid-js"
import { CommandProvider } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { HighlightsProvider } from "@/context/highlights"
import { LanguageProvider, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { PromptProvider } from "@/context/prompt"
import { type ServerConnection, ServerProvider, useServer } from "@/context/server"
import { SettingsProvider } from "@/context/settings"
import { TerminalProvider } from "@/context/terminal"
import DirectoryLayout from "@/pages/directory-layout"
import Layout from "@/pages/layout"
import { ErrorPage } from "./pages/error"
import { Dynamic } from "solid-js/web"

const Home = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))
const StoreLayout = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreHome })))
const StoreSkills = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreSkills })))
const StoreSubagents = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreSubagents })))
const StoreCommands = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreCommands })))
const StoreMcpServers = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreMcpServers })))
const StoreItemDetail = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreItemDetail })))
const StoreDashboard = lazy(() => import("@opencode-ai/store").then((m) => ({ default: m.StoreDashboard })))
const Loading = () => <div class="size-full" />

const HomeRoute = () => (
  <Suspense fallback={<Loading />}>
    <Home />
  </Suspense>
)

const StoreHomeRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreHome />
  </Suspense>
)
const StoreSkillsRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreSkills />
  </Suspense>
)
const StoreSubagentsRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreSubagents />
  </Suspense>
)
const StoreCommandsRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreCommands />
  </Suspense>
)
const StoreMcpServersRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreMcpServers />
  </Suspense>
)
const StoreItemDetailRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreItemDetail />
  </Suspense>
)
const StoreDashboardRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreDashboard />
  </Suspense>
)

const SessionRoute = () => (
  <SessionProviders>
    <Suspense fallback={<Loading />}>
      <Session />
    </Suspense>
  </SessionProviders>
)

const SessionIndexRoute = () => <Navigate href="session" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENCODE__?: {
      updaterEnabled?: boolean
      deepLinks?: string[]
      wsl?: boolean
    }
  }
}

function MarkedProviderWithNativeParser(props: ParentProps) {
  const platform = usePlatform()
  return <MarkedProvider nativeParser={platform.parseMarkdown}>{props.children}</MarkedProvider>
}

function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          <NotificationProvider>
            <ModelsProvider>
              <CommandProvider>
                <HighlightsProvider>
                  <Layout>{props.children}</Layout>
                </HighlightsProvider>
              </CommandProvider>
            </ModelsProvider>
          </NotificationProvider>
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}

function SessionProviders(props: ParentProps) {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>{props.children}</CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}

function RouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
  return (
    <AppShellProviders>
      {props.appChildren}
      {props.children}
    </AppShellProviders>
  )
}

export function AppBaseProviders(props: ParentProps) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider>
        <LanguageProvider>
          <UiI18nBridge>
            <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
              <DialogProvider>
                <MarkedProviderWithNativeParser>
                  <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                </MarkedProviderWithNativeParser>
              </DialogProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.key} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
}) {
  return (
    <ServerProvider defaultServer={props.defaultServer} servers={props.servers}>
      <ServerKey>
        <GlobalSDKProvider>
          <GlobalSyncProvider>
            <Dynamic
              component={props.router ?? Router}
              root={(routerProps) => <RouterRoot appChildren={props.children}>{routerProps.children}</RouterRoot>}
            >
              <Route path="/" component={HomeRoute} />
              <Route path="/store" component={StoreLayout}>
                <Route path="/" component={StoreHomeRoute} />
                <Route path="/skills" component={StoreSkillsRoute} />
                <Route path="/subagents" component={StoreSubagentsRoute} />
                <Route path="/commands" component={StoreCommandsRoute} />
                <Route path="/mcp-servers" component={StoreMcpServersRoute} />
                <Route path="/items/:id" component={StoreItemDetailRoute} />
                <Route path="/dashboard" component={StoreDashboardRoute} />
              </Route>
              <Route path="/:dir" component={DirectoryLayout}>
                <Route path="/" component={SessionIndexRoute} />
                <Route path="/session/:id?" component={SessionRoute} />
              </Route>
            </Dynamic>
          </GlobalSyncProvider>
        </GlobalSDKProvider>
      </ServerKey>
    </ServerProvider>
  )
}
