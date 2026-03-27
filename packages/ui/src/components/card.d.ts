import { type ComponentProps } from "solid-js";
import { type IconProps } from "./icon";
type Variant = "normal" | "error" | "warning" | "success" | "info";
export interface CardProps extends ComponentProps<"div"> {
    variant?: Variant;
}
export interface CardTitleProps extends ComponentProps<"div"> {
    variant?: Variant;
    /**
     * Optional title icon.
     *
     * - `undefined`: picks a default icon based on `variant` (error/warning/success/info)
     * - `false`/`null`: disables the icon
     * - `Icon` name: forces a specific icon
     */
    icon?: IconProps["name"] | false | null;
}
export declare function Card(props: CardProps): import("solid-js").JSX.Element;
export declare function CardTitle(props: CardTitleProps): import("solid-js").JSX.Element;
export declare function CardDescription(props: ComponentProps<"div">): import("solid-js").JSX.Element;
export declare function CardActions(props: ComponentProps<"div">): import("solid-js").JSX.Element;
export {};
