import { Component, type JSX } from "solid-js";
import { AssistantMessage, Message as MessageType, Part as PartType, UserMessage } from "@opencode-ai/sdk/v2";
export interface MessageProps {
    message: MessageType;
    parts: PartType[];
    actions?: UserActions;
    showAssistantCopyPartID?: string | null;
    showReasoningSummaries?: boolean;
}
export type SessionAction = (input: {
    sessionID: string;
    messageID: string;
}) => Promise<void> | void;
export type UserActions = {
    fork?: SessionAction;
    revert?: SessionAction;
};
export interface MessagePartProps {
    part: PartType;
    message: MessageType;
    hideDetails?: boolean;
    defaultOpen?: boolean;
    showAssistantCopyPartID?: string | null;
    turnDurationMs?: number;
}
export type PartComponent = Component<MessagePartProps>;
export declare const PART_MAPPING: Record<string, PartComponent | undefined>;
import type { IconProps } from "./icon";
export type ToolInfo = {
    icon: IconProps["name"];
    title: string;
    subtitle?: string;
};
export declare function getToolInfo(tool: string, input?: any): ToolInfo;
export declare function AssistantParts(props: {
    messages: AssistantMessage[];
    showAssistantCopyPartID?: string | null;
    turnDurationMs?: number;
    working?: boolean;
    showReasoningSummaries?: boolean;
    shellToolDefaultOpen?: boolean;
    editToolDefaultOpen?: boolean;
}): JSX.Element;
export declare function registerPartComponent(type: string, component: PartComponent): void;
export declare function Message(props: MessageProps): JSX.Element;
export declare function AssistantMessageDisplay(props: {
    message: AssistantMessage;
    parts: PartType[];
    showAssistantCopyPartID?: string | null;
    showReasoningSummaries?: boolean;
}): JSX.Element;
export declare function UserMessageDisplay(props: {
    message: UserMessage;
    parts: PartType[];
    actions?: UserActions;
}): JSX.Element;
export declare function Part(props: MessagePartProps): JSX.Element;
export interface ToolProps {
    input: Record<string, any>;
    metadata: Record<string, any>;
    tool: string;
    output?: string;
    status?: string;
    hideDetails?: boolean;
    defaultOpen?: boolean;
    forceOpen?: boolean;
    locked?: boolean;
}
export type ToolComponent = Component<ToolProps>;
export declare function registerTool(input: {
    name: string;
    render?: ToolComponent;
}): {
    name: string;
    render?: ToolComponent | undefined;
};
export declare function getTool(name: string): ToolComponent | undefined;
export declare const ToolRegistry: {
    register: typeof registerTool;
    render: typeof getTool;
};
export declare function MessageDivider(props: {
    label: string;
}): JSX.Element;
