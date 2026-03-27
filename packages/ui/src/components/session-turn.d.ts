import type { SessionStatus } from "@opencode-ai/sdk/v2";
import { ParentProps } from "solid-js";
import { type UserActions } from "./message-part";
export declare function SessionTurn(props: ParentProps<{
    sessionID: string;
    messageID: string;
    actions?: UserActions;
    showReasoningSummaries?: boolean;
    shellToolDefaultOpen?: boolean;
    editToolDefaultOpen?: boolean;
    active?: boolean;
    status?: SessionStatus;
    onUserInteracted?: () => void;
    classes?: {
        root?: string;
        content?: string;
        container?: string;
    };
}>): import("solid-js").JSX.Element;
