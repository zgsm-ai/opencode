import { type ComponentProps } from "solid-js";
export interface AvatarProps extends ComponentProps<"div"> {
    fallback: string;
    src?: string;
    background?: string;
    foreground?: string;
    size?: "small" | "normal" | "large";
}
export declare function Avatar(props: AvatarProps): import("solid-js").JSX.Element;
