import type { DesktopTheme, ResolvedTheme, ThemeVariant } from "./types";
export declare function resolveThemeVariant(variant: ThemeVariant, isDark: boolean): ResolvedTheme;
export declare function resolveTheme(theme: DesktopTheme): {
    light: ResolvedTheme;
    dark: ResolvedTheme;
};
export declare function themeToCss(tokens: ResolvedTheme): string;
