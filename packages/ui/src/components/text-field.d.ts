import { TextField as Kobalte } from "@kobalte/core/text-field";
import type { ComponentProps } from "solid-js";
export interface TextFieldProps extends ComponentProps<typeof Kobalte.Input>, Partial<Pick<ComponentProps<typeof Kobalte>, "name" | "defaultValue" | "value" | "onChange" | "onKeyDown" | "validationState" | "required" | "disabled" | "readOnly">> {
    label?: string;
    hideLabel?: boolean;
    description?: string;
    error?: string;
    variant?: "normal" | "ghost";
    copyable?: boolean;
    copyKind?: "clipboard" | "link";
    multiline?: boolean;
}
export declare function TextField(props: TextFieldProps): import("solid-js").JSX.Element;
