export declare function TextReveal(props: {
    text?: string;
    class?: string;
    duration?: number | string;
    /** Gradient edge softness as a percentage of the mask (0 = hard wipe, 17 = soft). */
    edge?: number;
    /** Optional small vertical travel for entering text (px). Default 0. */
    travel?: number | string;
    spring?: string;
    springSoft?: string;
    growOnly?: boolean;
    truncate?: boolean;
}): import("solid-js").JSX.Element;
