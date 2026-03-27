import { type ComponentProps } from "solid-js";
export interface ProgressCircleProps extends Pick<ComponentProps<"svg">, "class" | "classList"> {
    percentage: number;
    size?: number;
    strokeWidth?: number;
}
export declare function ProgressCircle(props: ProgressCircleProps): import("solid-js").JSX.Element;
