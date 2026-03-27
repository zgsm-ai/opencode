import type { DesktopTheme } from "./types";
export declare function applyTheme(theme: DesktopTheme, themeId?: string): void;
export declare function loadThemeFromUrl(url: string): Promise<DesktopTheme>;
export declare function getActiveTheme(): DesktopTheme | null;
export declare function removeTheme(): void;
export declare function setColorScheme(scheme: "light" | "dark" | "auto"): void;
