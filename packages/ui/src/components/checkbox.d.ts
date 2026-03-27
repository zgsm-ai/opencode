import { Checkbox as Kobalte } from "@kobalte/core/checkbox";
import type { ComponentProps, JSX, ParentProps } from "solid-js";
export interface CheckboxProps extends ParentProps<ComponentProps<typeof Kobalte>> {
    hideLabel?: boolean;
    description?: string;
    icon?: JSX.Element;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
