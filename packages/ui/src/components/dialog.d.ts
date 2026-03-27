import { ComponentProps, JSXElement, ParentProps } from "solid-js";
export interface DialogProps extends ParentProps {
    title?: JSXElement;
    description?: JSXElement;
    action?: JSXElement;
    size?: "normal" | "large" | "x-large";
    class?: ComponentProps<"div">["class"];
    classList?: ComponentProps<"div">["classList"];
    fit?: boolean;
    transition?: boolean;
}
export declare function Dialog(props: DialogProps): import("solid-js").JSX.Element;
