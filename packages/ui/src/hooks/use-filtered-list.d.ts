export interface FilteredListProps<T> {
    items: T[] | ((filter: string) => T[] | Promise<T[]>);
    key: (item: T) => string;
    filterKeys?: string[];
    current?: T;
    groupBy?: (x: T) => string;
    sortBy?: (a: T, b: T) => number;
    sortGroupsBy?: (a: {
        category: string;
        items: T[];
    }, b: {
        category: string;
        items: T[];
    }) => number;
    onSelect?: (value: T | undefined, index: number) => void;
    noInitialSelection?: boolean;
}
export declare function useFilteredList<T>(props: FilteredListProps<T>): {
    grouped: import("solid-js").InitializedResource<{
        category: string;
        items: [T, ...T[]];
    }[]>;
    filter: () => string;
    flat: import("solid-js").Accessor<T[]>;
    reset: () => void;
    refetch: (info?: unknown) => {
        category: string;
        items: [T, ...T[]];
    }[] | Promise<{
        category: string;
        items: [T, ...T[]];
    }[]> | null | undefined;
    clear: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
    onInput: (value: string) => void;
    active: import("solid-js").Accessor<string | null>;
    setActive: import("solid-js").Setter<string | null>;
};
