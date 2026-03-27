import type { DesktopTheme } from "./types";
export type ColorScheme = "light" | "dark" | "system";
export declare const useTheme: () => {
    themeId: () => string;
    colorScheme: () => ColorScheme;
    mode: () => "dark" | "light";
    themes: () => Record<string, DesktopTheme>;
    setTheme: (id: string) => void;
    setColorScheme: (scheme: ColorScheme) => void;
    registerTheme: (theme: DesktopTheme) => void;
    previewTheme: (id: string) => void;
    previewColorScheme: (scheme: ColorScheme) => void;
    commitPreview: () => void;
    cancelPreview: () => void;
}, ThemeProvider: (props: import("solid-js").ParentProps<{
    defaultTheme?: string | undefined;
    onThemeApplied?: ((theme: DesktopTheme, mode: "dark" | "light") => void) | undefined;
}>) => import("solid-js").JSX.Element;
