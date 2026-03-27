import type { HexColor, OklchColor } from "./types";
export declare function hexToRgb(hex: HexColor): {
    r: number;
    g: number;
    b: number;
};
export declare function rgbToHex(r: number, g: number, b: number): HexColor;
export declare function rgbToOklch(r: number, g: number, b: number): OklchColor;
export declare function oklchToRgb(oklch: OklchColor): {
    r: number;
    g: number;
    b: number;
};
export declare function hexToOklch(hex: HexColor): OklchColor;
export declare function fitOklch(oklch: OklchColor): OklchColor;
export declare function oklchToHex(oklch: OklchColor): HexColor;
export declare function generateScale(seed: HexColor, isDark: boolean): HexColor[];
export declare function generateNeutralScale(seed: HexColor, isDark: boolean, ink?: HexColor): HexColor[];
export declare function generateAlphaScale(scale: HexColor[], isDark: boolean): HexColor[];
export declare function mixColors(color1: HexColor, color2: HexColor, amount: number): HexColor;
export declare function shift(color: HexColor, value: {
    l?: number;
    c?: number;
    h?: number;
}): HexColor;
export declare function blend(color: HexColor, background: HexColor, alpha: number): HexColor;
export declare function lighten(color: HexColor, amount: number): HexColor;
export declare function darken(color: HexColor, amount: number): HexColor;
export declare function withAlpha(color: HexColor, alpha: number): string;
