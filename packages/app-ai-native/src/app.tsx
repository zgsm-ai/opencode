import "@/index.css"
import "@/styles/session-markdown.css"
import { File } from "@opencode-ai/ui/file"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { Font } from "@opencode-ai/ui/font"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import { MetaProvider } from "@solidjs/meta"
import { createEffect, ErrorBoundary, type ParentProps, Suspense } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { LanguageProvider } from "@/context/language"
import { SettingsProvider } from "@/context/settings"
import { AuthProvider } from "@/context/auth"
import { SessionExpiredProvider } from "@/lib/session-expired"
import { RateLimitToastProvider } from "@/lib/rate-limit-toast"
import { ItemFilterOptionsProvider } from "@/context/item-filter-options"
import { ErrorPage } from "./pages/error"
import { useTheme } from "@opencode-ai/ui/theme"

const Loading = () => <div class="size-full" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

function FixedExperienceGuards(props: ParentProps) {
  const theme = useTheme()

  createEffect(() => {
    if (theme.themeId() !== "vercel") {
      theme.setTheme("vercel")
    }
  })

  return props.children
}

function MarkedProviderWithNativeParser(props: ParentProps) {
  const platform = usePlatform()
  return <MarkedProvider nativeParser={platform.parseMarkdown}>{props.children}</MarkedProvider>
}

export function AppBaseProviders(props: ParentProps) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider defaultTheme="vercel">
        <LanguageProvider>
          <SettingsProvider>
            <FixedExperienceGuards>
              <UiI18nBridge>
                <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
                  <DialogProvider>
                    <SessionExpiredProvider>
                      <RateLimitToastProvider>
                        <MarkedProviderWithNativeParser>
                        <FileComponentProvider component={File}>
                          <AuthProvider>
                            <ItemFilterOptionsProvider>{props.children}</ItemFilterOptionsProvider>
                          </AuthProvider>
                        </FileComponentProvider>
                      </MarkedProviderWithNativeParser>
                      </RateLimitToastProvider>
                    </SessionExpiredProvider>
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
