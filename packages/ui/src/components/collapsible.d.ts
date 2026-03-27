import { Collapsible as Kobalte, CollapsibleRootProps } from "@kobalte/core/collapsible";
import { ComponentProps, ParentProps } from "solid-js";
export interface CollapsibleProps extends ParentProps<CollapsibleRootProps> {
    class?: string;
    classList?: ComponentProps<"div">["classList"];
    variant?: "normal" | "ghost";
}
declare function CollapsibleRoot(props: CollapsibleProps): import("solid-js").JSX.Element;
declare function CollapsibleTrigger(props: ComponentProps<typeof Kobalte.Trigger>): import("solid-js").JSX.Element;
declare function CollapsibleContent(props: ComponentProps<typeof Kobalte.Content>): import("solid-js").JSX.Element;
declare function CollapsibleArrow(props?: ComponentProps<"div">): import("solid-js").JSX.Element;
export declare const Collapsible: typeof CollapsibleRoot & {
    Arrow: typeof CollapsibleArrow;
    Trigger: typeof CollapsibleTrigger;
    Content: typeof CollapsibleContent;
};
export {};
