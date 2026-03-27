import { HoverCard as Kobalte } from "@kobalte/core/hover-card";
import { ComponentProps, JSXElement, ParentProps } from "solid-js";
export interface HoverCardProps extends ParentProps, Omit<ComponentProps<typeof Kobalte>, "children"> {
    trigger: JSXElement;
    mount?: HTMLElement;
    class?: ComponentProps<"div">["class"];
    classList?: ComponentProps<"div">["classList"];
}
export declare function HoverCard(props: HoverCardProps): import("solid-js").JSX.Element;
