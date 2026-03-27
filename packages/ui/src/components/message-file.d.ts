import type { FilePart } from "@opencode-ai/sdk/v2";
export declare function attached(part: FilePart): boolean;
export declare function inline(part: FilePart): boolean;
export declare function kind(part: FilePart): "file" | "image";
