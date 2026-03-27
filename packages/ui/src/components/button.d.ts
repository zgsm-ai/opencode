import { Button as Kobalte } from "@kobalte/core/button";
import { type ComponentProps } from "solid-js";
import { IconProps } from "./icon";
export interface ButtonProps extends ComponentProps<typeof Kobalte>, Pick<ComponentProps<"button">, "class" | "classList" | "children"> {
    size?: "small" | "normal" | "large";
    variant?: "primary" | "secondary" | "ghost";
    icon?: IconProps["name"];
}
export declare function Button(props: ButtonProps): import("solid-js").JSX.Element;
