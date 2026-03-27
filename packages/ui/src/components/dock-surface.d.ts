import { type ComponentProps } from "solid-js";
export interface DockTrayProps extends ComponentProps<"div"> {
    attach?: "none" | "top";
}
export declare function DockShell(props: ComponentProps<"div">): import("solid-js").JSX.Element;
export declare function DockShellForm(props: ComponentProps<"form">): import("solid-js").JSX.Element;
export declare function DockTray(props: DockTrayProps): import("solid-js").JSX.Element;
