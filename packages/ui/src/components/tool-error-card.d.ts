import { type ComponentProps } from "solid-js";
import { Card } from "./card";
export interface ToolErrorCardProps extends Omit<ComponentProps<typeof Card>, "children" | "variant"> {
    tool: string;
    error: string;
    defaultOpen?: boolean;
    subtitle?: string;
    href?: string;
}
export declare function ToolErrorCard(props: ToolErrorCardProps): import("solid-js").JSX.Element;
