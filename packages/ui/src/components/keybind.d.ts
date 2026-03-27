import type { ComponentProps, ParentProps } from "solid-js";
export interface KeybindProps extends ParentProps {
    class?: string;
    classList?: ComponentProps<"span">["classList"];
}
export declare function Keybind(props: KeybindProps): import("solid-js").JSX.Element;
