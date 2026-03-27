import { type FilteredListProps } from "@opencode-ai/ui/hooks";
import { type JSX } from "solid-js";
import { type IconProps } from "./icon";
export interface ListSearchProps {
    placeholder?: string;
    autofocus?: boolean;
    hideIcon?: boolean;
    class?: string;
    action?: JSX.Element;
}
export interface ListAddProps {
    class?: string;
    render: () => JSX.Element;
}
export interface ListAddProps {
    class?: string;
    render: () => JSX.Element;
}
export interface ListProps<T> extends FilteredListProps<T> {
    class?: string;
    children: (item: T) => JSX.Element;
    emptyMessage?: string;
    loadingMessage?: string;
    onKeyEvent?: (event: KeyboardEvent, item: T | undefined) => void;
    onMove?: (item: T | undefined) => void;
    onFilter?: (value: string) => void;
    activeIcon?: IconProps["name"];
    filter?: string;
    search?: ListSearchProps | boolean;
    itemWrapper?: (item: T, node: JSX.Element) => JSX.Element;
    divider?: boolean;
    add?: ListAddProps;
    groupHeader?: (group: {
        category: string;
        items: T[];
    }) => JSX.Element;
}
export interface ListRef {
    onKeyDown: (e: KeyboardEvent) => void;
    setScrollRef: (el: HTMLDivElement | undefined) => void;
    setFilter: (value: string) => void;
}
export declare function List<T>(props: ListProps<T> & {
    ref?: (ref: ListRef) => void;
}): JSX.Element;
