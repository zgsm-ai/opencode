export interface AutoScrollOptions {
    working: () => boolean;
    onUserInteracted?: () => void;
    overflowAnchor?: "none" | "auto" | "dynamic";
    bottomThreshold?: number;
}
export declare function createAutoScroll(options: AutoScrollOptions): {
    scrollRef: (el: HTMLElement | undefined) => void;
    contentRef: (el: HTMLElement | undefined) => void;
    handleScroll: () => void;
    handleInteraction: () => void;
    pause: () => void;
    resume: () => void;
    scrollToBottom: () => void;
    forceScrollToBottom: () => void;
    userScrolled: () => boolean;
};
