export declare function DiffChanges(props: {
    class?: string;
    changes: {
        additions: number;
        deletions: number;
    } | {
        additions: number;
        deletions: number;
    }[];
    variant?: "default" | "bars";
}): import("solid-js").JSX.Element;
