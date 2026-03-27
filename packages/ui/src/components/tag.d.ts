import { type ComponentProps } from "solid-js";
export interface TagProps extends ComponentProps<"span"> {
    size?: "normal" | "large";
}
export declare function Tag(props: TagProps): import("solid-js").JSX.Element;
