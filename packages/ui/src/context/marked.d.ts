import { marked } from "marked";
export type NativeMarkdownParser = (markdown: string) => Promise<string>;
export declare const useMarked: () => NonNullable<typeof marked | {
    parse(markdown: string): Promise<string>;
}>, MarkedProvider: (props: import("solid-js").ParentProps<{
    nativeParser?: NativeMarkdownParser | undefined;
}>) => import("solid-js").JSX.Element;
