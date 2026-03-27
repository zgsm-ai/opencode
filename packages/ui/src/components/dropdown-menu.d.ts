import { DropdownMenu as Kobalte } from "@kobalte/core/dropdown-menu";
import type { ComponentProps, ParentProps } from "solid-js";
export interface DropdownMenuProps extends ComponentProps<typeof Kobalte> {
}
export interface DropdownMenuTriggerProps extends ComponentProps<typeof Kobalte.Trigger> {
}
export interface DropdownMenuIconProps extends ComponentProps<typeof Kobalte.Icon> {
}
export interface DropdownMenuPortalProps extends ComponentProps<typeof Kobalte.Portal> {
}
export interface DropdownMenuContentProps extends ComponentProps<typeof Kobalte.Content> {
}
export interface DropdownMenuArrowProps extends ComponentProps<typeof Kobalte.Arrow> {
}
export interface DropdownMenuSeparatorProps extends ComponentProps<typeof Kobalte.Separator> {
}
export interface DropdownMenuGroupProps extends ComponentProps<typeof Kobalte.Group> {
}
export interface DropdownMenuGroupLabelProps extends ComponentProps<typeof Kobalte.GroupLabel> {
}
export interface DropdownMenuItemProps extends ComponentProps<typeof Kobalte.Item> {
}
export interface DropdownMenuItemLabelProps extends ComponentProps<typeof Kobalte.ItemLabel> {
}
export interface DropdownMenuItemDescriptionProps extends ComponentProps<typeof Kobalte.ItemDescription> {
}
export interface DropdownMenuItemIndicatorProps extends ComponentProps<typeof Kobalte.ItemIndicator> {
}
export interface DropdownMenuRadioGroupProps extends ComponentProps<typeof Kobalte.RadioGroup> {
}
export interface DropdownMenuRadioItemProps extends ComponentProps<typeof Kobalte.RadioItem> {
}
export interface DropdownMenuCheckboxItemProps extends ComponentProps<typeof Kobalte.CheckboxItem> {
}
export interface DropdownMenuSubProps extends ComponentProps<typeof Kobalte.Sub> {
}
export interface DropdownMenuSubTriggerProps extends ComponentProps<typeof Kobalte.SubTrigger> {
}
export interface DropdownMenuSubContentProps extends ComponentProps<typeof Kobalte.SubContent> {
}
declare function DropdownMenuRoot(props: DropdownMenuProps): import("solid-js").JSX.Element;
declare function DropdownMenuTrigger(props: ParentProps<DropdownMenuTriggerProps>): import("solid-js").JSX.Element;
declare function DropdownMenuIcon(props: ParentProps<DropdownMenuIconProps>): import("solid-js").JSX.Element;
declare function DropdownMenuPortal(props: DropdownMenuPortalProps): import("solid-js").JSX.Element;
declare function DropdownMenuContent(props: ParentProps<DropdownMenuContentProps>): import("solid-js").JSX.Element;
declare function DropdownMenuArrow(props: DropdownMenuArrowProps): import("solid-js").JSX.Element;
declare function DropdownMenuSeparator(props: DropdownMenuSeparatorProps): import("solid-js").JSX.Element;
declare function DropdownMenuGroup(props: ParentProps<DropdownMenuGroupProps>): import("solid-js").JSX.Element;
declare function DropdownMenuGroupLabel(props: ParentProps<DropdownMenuGroupLabelProps>): import("solid-js").JSX.Element;
declare function DropdownMenuItem(props: ParentProps<DropdownMenuItemProps>): import("solid-js").JSX.Element;
declare function DropdownMenuItemLabel(props: ParentProps<DropdownMenuItemLabelProps>): import("solid-js").JSX.Element;
declare function DropdownMenuItemDescription(props: ParentProps<DropdownMenuItemDescriptionProps>): import("solid-js").JSX.Element;
declare function DropdownMenuItemIndicator(props: ParentProps<DropdownMenuItemIndicatorProps>): import("solid-js").JSX.Element;
declare function DropdownMenuRadioGroup(props: ParentProps<DropdownMenuRadioGroupProps>): import("solid-js").JSX.Element;
declare function DropdownMenuRadioItem(props: ParentProps<DropdownMenuRadioItemProps>): import("solid-js").JSX.Element;
declare function DropdownMenuCheckboxItem(props: ParentProps<DropdownMenuCheckboxItemProps>): import("solid-js").JSX.Element;
declare function DropdownMenuSub(props: DropdownMenuSubProps): import("solid-js").JSX.Element;
declare function DropdownMenuSubTrigger(props: ParentProps<DropdownMenuSubTriggerProps>): import("solid-js").JSX.Element;
declare function DropdownMenuSubContent(props: ParentProps<DropdownMenuSubContentProps>): import("solid-js").JSX.Element;
export declare const DropdownMenu: typeof DropdownMenuRoot & {
    Trigger: typeof DropdownMenuTrigger;
    Icon: typeof DropdownMenuIcon;
    Portal: typeof DropdownMenuPortal;
    Content: typeof DropdownMenuContent;
    Arrow: typeof DropdownMenuArrow;
    Separator: typeof DropdownMenuSeparator;
    Group: typeof DropdownMenuGroup;
    GroupLabel: typeof DropdownMenuGroupLabel;
    Item: typeof DropdownMenuItem;
    ItemLabel: typeof DropdownMenuItemLabel;
    ItemDescription: typeof DropdownMenuItemDescription;
    ItemIndicator: typeof DropdownMenuItemIndicator;
    RadioGroup: typeof DropdownMenuRadioGroup;
    RadioItem: typeof DropdownMenuRadioItem;
    CheckboxItem: typeof DropdownMenuCheckboxItem;
    Sub: typeof DropdownMenuSub;
    SubTrigger: typeof DropdownMenuSubTrigger;
    SubContent: typeof DropdownMenuSubContent;
};
export {};
