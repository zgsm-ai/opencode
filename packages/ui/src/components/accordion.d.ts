import { Accordion as Kobalte } from "@kobalte/core/accordion";
import type { ComponentProps, ParentProps } from "solid-js";
export interface AccordionProps extends ComponentProps<typeof Kobalte> {
}
export interface AccordionItemProps extends ComponentProps<typeof Kobalte.Item> {
}
export interface AccordionHeaderProps extends ComponentProps<typeof Kobalte.Header> {
}
export interface AccordionTriggerProps extends ComponentProps<typeof Kobalte.Trigger> {
}
export interface AccordionContentProps extends ComponentProps<typeof Kobalte.Content> {
}
declare function AccordionRoot(props: AccordionProps): import("solid-js").JSX.Element;
declare function AccordionItem(props: AccordionItemProps): import("solid-js").JSX.Element;
declare function AccordionHeader(props: ParentProps<AccordionHeaderProps>): import("solid-js").JSX.Element;
declare function AccordionTrigger(props: ParentProps<AccordionTriggerProps>): import("solid-js").JSX.Element;
declare function AccordionContent(props: ParentProps<AccordionContentProps>): import("solid-js").JSX.Element;
export declare const Accordion: typeof AccordionRoot & {
    Item: typeof AccordionItem;
    Header: typeof AccordionHeader;
    Trigger: typeof AccordionTrigger;
    Content: typeof AccordionContent;
};
export {};
