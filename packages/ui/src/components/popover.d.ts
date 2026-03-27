import { Popover as Kobalte } from "@kobalte/core/popover";
import { ComponentProps, JSXElement, ParentProps, ValidComponent } from "solid-js";
export interface PopoverProps<T extends ValidComponent = "div"> extends ParentProps, Omit<ComponentProps<typeof Kobalte>, "children"> {
    trigger?: JSXElement;
    triggerAs?: T;
    triggerProps?: ComponentProps<T>;
    title?: JSXElement;
    description?: JSXElement;
    class?: ComponentProps<"div">["class"];
    classList?: ComponentProps<"div">["classList"];
    style?: ComponentProps<"div">["style"];
    portal?: boolean;
}
export declare function Popover<T extends ValidComponent = "div">(props: PopoverProps<T>): import("solid-js").JSX.Element;
