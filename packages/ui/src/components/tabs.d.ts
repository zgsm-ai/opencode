import { Tabs as Kobalte } from "@kobalte/core/tabs";
import { type JSX } from "solid-js";
import type { ComponentProps, ParentProps, Component } from "solid-js";
export interface TabsProps extends ComponentProps<typeof Kobalte> {
    variant?: "normal" | "alt" | "pill" | "settings";
    orientation?: "horizontal" | "vertical";
}
export interface TabsListProps extends ComponentProps<typeof Kobalte.List> {
}
export interface TabsTriggerProps extends ComponentProps<typeof Kobalte.Trigger> {
    classes?: {
        button?: string;
    };
    hideCloseButton?: boolean;
    closeButton?: JSX.Element;
    onMiddleClick?: () => void;
}
export interface TabsContentProps extends ComponentProps<typeof Kobalte.Content> {
}
declare function TabsRoot(props: TabsProps): JSX.Element;
declare function TabsList(props: TabsListProps): JSX.Element;
declare function TabsTrigger(props: ParentProps<TabsTriggerProps>): JSX.Element;
declare function TabsContent(props: ParentProps<TabsContentProps>): JSX.Element;
export declare const Tabs: typeof TabsRoot & {
    List: typeof TabsList;
    Trigger: typeof TabsTrigger;
    Content: typeof TabsContent;
    SectionTitle: Component<{
        children?: JSX.Element;
    }>;
};
export {};
