import { type JSX } from "solid-js";
import type { IconProps } from "./icon";
export type TriggerTitle = {
    title: string;
    titleClass?: string;
    subtitle?: string;
    subtitleClass?: string;
    args?: string[];
    argsClass?: string;
    action?: JSX.Element;
};
export interface BasicToolProps {
    icon: IconProps["name"];
    trigger: TriggerTitle | JSX.Element;
    children?: JSX.Element;
    status?: string;
    hideDetails?: boolean;
    defaultOpen?: boolean;
    forceOpen?: boolean;
    defer?: boolean;
    locked?: boolean;
    animated?: boolean;
    onSubtitleClick?: () => void;
}
export declare function BasicTool(props: BasicToolProps): JSX.Element;
export declare function GenericTool(props: {
    tool: string;
    status?: string;
    hideDetails?: boolean;
    input?: Record<string, unknown>;
}): JSX.Element;
