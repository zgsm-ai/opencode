import type { JSX } from "solid-js";
export declare function TextStrikethrough(props: {
    /** Whether the strikethrough is active (line drawn across). */
    active: boolean;
    /** The text to display. Rendered twice internally (base + decoration overlay). */
    text: string;
    /** Spring visual duration in seconds. Default 0.35. */
    visualDuration?: number;
    class?: string;
    style?: JSX.CSSProperties;
}): JSX.Element;
