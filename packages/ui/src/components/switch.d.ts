import { Switch as Kobalte } from "@kobalte/core/switch";
import type { ComponentProps, ParentProps } from "solid-js";
export interface SwitchProps extends ParentProps<ComponentProps<typeof Kobalte>> {
    hideLabel?: boolean;
    description?: string;
}
export declare function Switch(props: SwitchProps): import("solid-js").JSX.Element;
