import type { FileContent } from "@opencode-ai/sdk/v2";
import { type JSX } from "solid-js";
export type FileMediaOptions = {
    mode?: "auto" | "off";
    path?: string;
    current?: unknown;
    before?: unknown;
    after?: unknown;
    readFile?: (path: string) => Promise<FileContent | undefined>;
    onLoad?: () => void;
    onError?: (ctx: {
        kind: "image" | "audio" | "svg";
    }) => void;
};
export declare function FileMedia(props: {
    media?: FileMediaOptions;
    fallback: () => JSX.Element;
}): JSX.Element;
