import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";
import { type JSX } from "solid-js";
import type { ComponentProps } from "solid-js";
export interface TooltipProps extends ComponentProps<typeof KobalteTooltip> {
    value: JSX.Element;
    class?: string;
    contentClass?: string;
    contentStyle?: JSX.CSSProperties;
    inactive?: boolean;
    forceOpen?: boolean;
}
export interface TooltipKeybindProps extends Omit<TooltipProps, "value"> {
    title: string;
    keybind: string;
}
export declare function TooltipKeybind(props: TooltipKeybindProps): JSX.Element;
export declare function Tooltip(props: TooltipProps): JSX.Element;
