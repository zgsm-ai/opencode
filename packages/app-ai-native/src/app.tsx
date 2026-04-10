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
import { Component, createEffect, ErrorBoundary, type JSX, lazy, type ParentProps, Show, Suspense } from "solid-js"
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
import { AuthProvider } from "@/context/auth"
import DirectoryLayout from "@/pages/directory-layout"
import Layout from "@/pages/layout"
import { ErrorPage } from "./pages/error"
import { Dynamic } from "solid-js/web"
import { useTheme } from "@opencode-ai/ui/theme"

const Home = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))
const StoreLayout = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreLayout })))
const StoreHome = lazy(() => import("@/pages/store").then((m) => ({ default: m.StoreHome })))
const Loading = () => <div class="size-full" />

const HomeRoute = () => <Navigate href="/store" />

const StoreHomeRoute = () => (
  <Suspense fallback={<Loading />}>
    <StoreHome />
  </Suspense>
)

const StoreDashboardRoute = () => <Navigate href="/store/dashboard/repositories" />

export const SessionRoute = () => (
  <SessionProviders>
    <Suspense fallback={<Loading />}>
      <Session />
    </Suspense>
  </SessionProviders>
)

export const SessionIndexRoute = () => <Navigate href="session" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

function FixedExperienceGuards(props: ParentProps) {
  const language = useLanguage()
  const theme = useTheme()

  createEffect(() => {
    // TODO: 后续支持设置页后，移除这里的强制覆盖，改回用户可配置。
    if (language.locale() !== "zh") {
      language.setLocale("zh")
    }

    // TODO: 后续支持主题切换后，移除这里的强制覆盖，改回用户可配置。
    if (theme.themeId() !== "oc-2") {
      theme.setTheme("oc-2")
    }

    if (theme.colorScheme() !== "light") {
      theme.setColorScheme("light")
    }
  })

  return props.children
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

export function AppShellProviders(props: ParentProps) {
  return (
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

export function RouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
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
          <SettingsProvider>
            <FixedExperienceGuards>
              <UiI18nBridge>
                <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
                  <DialogProvider>
                    <MarkedProviderWithNativeParser>
                      <FileComponentProvider component={File}>
                        <AuthProvider>{props.children}</AuthProvider>
                      </FileComponentProvider>
                    </MarkedProviderWithNativeParser>
                  </DialogProvider>
                </ErrorBoundary>
              </UiI18nBridge>
            </FixedExperienceGuards>
          </SettingsProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

export function ServerKey(props: ParentProps) {
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
              </Route>
            </Dynamic>
          </GlobalSyncProvider>
        </GlobalSDKProvider>
      </ServerKey>
    </ServerProvider>
  )
}
