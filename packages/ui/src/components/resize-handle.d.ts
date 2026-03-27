import { type JSX } from "solid-js";
export interface ResizeHandleProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onResize"> {
    direction: "horizontal" | "vertical";
    edge?: "start" | "end";
    size: number;
    min: number;
    max: number;
    onResize: (size: number) => void;
    onCollapse?: () => void;
    collapseThreshold?: number;
}
export declare function ResizeHandle(props: ResizeHandleProps): JSX.Element;
