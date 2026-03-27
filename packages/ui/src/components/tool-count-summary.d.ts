export type CountItem = {
    key: string;
    count: number;
    one: string;
    other: string;
};
export declare function AnimatedCountList(props: {
    items: CountItem[];
    fallback?: string;
    class?: string;
}): import("solid-js").JSX.Element;
