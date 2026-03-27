import { UserMessage } from "@opencode-ai/sdk/v2";
import { ComponentProps } from "solid-js";
export declare function MessageNav(props: ComponentProps<"ul"> & {
    messages: UserMessage[];
    current?: UserMessage;
    size: "normal" | "compact";
    onMessageSelect: (message: UserMessage) => void;
    getLabel?: (message: UserMessage) => string | undefined;
}): import("solid-js").JSX.Element;
