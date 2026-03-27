import { type ValidComponent } from "solid-js";
export declare const TextShimmer: <T extends ValidComponent = "span">(props: {
    text: string;
    class?: string | undefined;
    as?: T | undefined;
    active?: boolean | undefined;
    offset?: number | undefined;
}) => import("solid-js").JSX.Element;
