import { type ComponentProps } from "solid-js";
export interface ScrollViewProps extends ComponentProps<"div"> {
    viewportRef?: (el: HTMLDivElement) => void;
    orientation?: "vertical" | "horizontal";
}
export declare const scrollKey: (event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">) => "down" | "end" | "home" | "page-down" | "page-up" | "up" | undefined;
export declare function ScrollView(props: ScrollViewProps): import("solid-js").JSX.Element;
