import { ContextMenu as Kobalte } from "@kobalte/core/context-menu";
import type { ComponentProps, ParentProps } from "solid-js";
export interface ContextMenuProps extends ComponentProps<typeof Kobalte> {
}
export interface ContextMenuTriggerProps extends ComponentProps<typeof Kobalte.Trigger> {
}
export interface ContextMenuIconProps extends ComponentProps<typeof Kobalte.Icon> {
}
export interface ContextMenuPortalProps extends ComponentProps<typeof Kobalte.Portal> {
}
export interface ContextMenuContentProps extends ComponentProps<typeof Kobalte.Content> {
}
export interface ContextMenuArrowProps extends ComponentProps<typeof Kobalte.Arrow> {
}
export interface ContextMenuSeparatorProps extends ComponentProps<typeof Kobalte.Separator> {
}
export interface ContextMenuGroupProps extends ComponentProps<typeof Kobalte.Group> {
}
export interface ContextMenuGroupLabelProps extends ComponentProps<typeof Kobalte.GroupLabel> {
}
export interface ContextMenuItemProps extends ComponentProps<typeof Kobalte.Item> {
}
export interface ContextMenuItemLabelProps extends ComponentProps<typeof Kobalte.ItemLabel> {
}
export interface ContextMenuItemDescriptionProps extends ComponentProps<typeof Kobalte.ItemDescription> {
}
export interface ContextMenuItemIndicatorProps extends ComponentProps<typeof Kobalte.ItemIndicator> {
}
export interface ContextMenuRadioGroupProps extends ComponentProps<typeof Kobalte.RadioGroup> {
}
export interface ContextMenuRadioItemProps extends ComponentProps<typeof Kobalte.RadioItem> {
}
export interface ContextMenuCheckboxItemProps extends ComponentProps<typeof Kobalte.CheckboxItem> {
}
export interface ContextMenuSubProps extends ComponentProps<typeof Kobalte.Sub> {
}
export interface ContextMenuSubTriggerProps extends ComponentProps<typeof Kobalte.SubTrigger> {
}
export interface ContextMenuSubContentProps extends ComponentProps<typeof Kobalte.SubContent> {
}
declare function ContextMenuRoot(props: ContextMenuProps): import("solid-js").JSX.Element;
declare function ContextMenuTrigger(props: ParentProps<ContextMenuTriggerProps>): import("solid-js").JSX.Element;
declare function ContextMenuIcon(props: ParentProps<ContextMenuIconProps>): import("solid-js").JSX.Element;
declare function ContextMenuPortal(props: ContextMenuPortalProps): import("solid-js").JSX.Element;
declare function ContextMenuContent(props: ParentProps<ContextMenuContentProps>): import("solid-js").JSX.Element;
declare function ContextMenuArrow(props: ContextMenuArrowProps): import("solid-js").JSX.Element;
declare function ContextMenuSeparator(props: ContextMenuSeparatorProps): import("solid-js").JSX.Element;
declare function ContextMenuGroup(props: ParentProps<ContextMenuGroupProps>): import("solid-js").JSX.Element;
declare function ContextMenuGroupLabel(props: ParentProps<ContextMenuGroupLabelProps>): import("solid-js").JSX.Element;
declare function ContextMenuItem(props: ParentProps<ContextMenuItemProps>): import("solid-js").JSX.Element;
declare function ContextMenuItemLabel(props: ParentProps<ContextMenuItemLabelProps>): import("solid-js").JSX.Element;
declare function ContextMenuItemDescription(props: ParentProps<ContextMenuItemDescriptionProps>): import("solid-js").JSX.Element;
declare function ContextMenuItemIndicator(props: ParentProps<ContextMenuItemIndicatorProps>): import("solid-js").JSX.Element;
declare function ContextMenuRadioGroup(props: ParentProps<ContextMenuRadioGroupProps>): import("solid-js").JSX.Element;
declare function ContextMenuRadioItem(props: ParentProps<ContextMenuRadioItemProps>): import("solid-js").JSX.Element;
declare function ContextMenuCheckboxItem(props: ParentProps<ContextMenuCheckboxItemProps>): import("solid-js").JSX.Element;
declare function ContextMenuSub(props: ContextMenuSubProps): import("solid-js").JSX.Element;
declare function ContextMenuSubTrigger(props: ParentProps<ContextMenuSubTriggerProps>): import("solid-js").JSX.Element;
declare function ContextMenuSubContent(props: ParentProps<ContextMenuSubContentProps>): import("solid-js").JSX.Element;
export declare const ContextMenu: typeof ContextMenuRoot & {
    Trigger: typeof ContextMenuTrigger;
    Icon: typeof ContextMenuIcon;
    Portal: typeof ContextMenuPortal;
    Content: typeof ContextMenuContent;
    Arrow: typeof ContextMenuArrow;
    Separator: typeof ContextMenuSeparator;
    Group: typeof ContextMenuGroup;
    GroupLabel: typeof ContextMenuGroupLabel;
    Item: typeof ContextMenuItem;
    ItemLabel: typeof ContextMenuItemLabel;
    ItemDescription: typeof ContextMenuItemDescription;
    ItemIndicator: typeof ContextMenuItemIndicator;
    RadioGroup: typeof ContextMenuRadioGroup;
    RadioItem: typeof ContextMenuRadioItem;
    CheckboxItem: typeof ContextMenuCheckboxItem;
    Sub: typeof ContextMenuSub;
    SubTrigger: typeof ContextMenuSubTrigger;
    SubContent: typeof ContextMenuSubContent;
};
export {};
