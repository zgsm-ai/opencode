export declare namespace Binary {
    function search<T>(array: T[], id: string, compare: (item: T) => string): {
        found: boolean;
        index: number;
    };
    function insert<T>(array: T[], item: T, compare: (item: T) => string): T[];
}
