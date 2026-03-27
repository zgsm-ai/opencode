import { Button as Kobalte } from "@kobalte/core/button";
import { type ComponentProps } from "solid-js";
import { IconProps } from "./icon";
export interface IconButtonProps extends ComponentProps<typeof Kobalte> {
    icon: IconProps["name"];
    size?: "small" | "normal" | "large";
    iconSize?: IconProps["size"];
    variant?: "primary" | "secondary" | "ghost";
}
export declare function IconButton(props: ComponentProps<"button"> & IconButtonProps): import("solid-js").JSX.Element;
