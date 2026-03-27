import { Toast as Kobalte, toaster } from "@kobalte/core/toast";
import type { ToastRootProps, ToastCloseButtonProps, ToastTitleProps, ToastDescriptionProps } from "@kobalte/core/toast";
import type { ComponentProps, JSX } from "solid-js";
import { type IconProps } from "./icon";
export interface ToastRegionProps extends ComponentProps<typeof Kobalte.Region> {
}
declare function ToastRegion(props: ToastRegionProps): JSX.Element;
export interface ToastRootComponentProps extends ToastRootProps {
    class?: string;
    classList?: ComponentProps<"li">["classList"];
    children?: JSX.Element;
}
declare function ToastRoot(props: ToastRootComponentProps): JSX.Element;
declare function ToastIcon(props: {
    name: IconProps["name"];
}): JSX.Element;
declare function ToastContent(props: ComponentProps<"div">): JSX.Element;
declare function ToastTitle(props: ToastTitleProps & ComponentProps<"div">): JSX.Element;
declare function ToastDescription(props: ToastDescriptionProps & ComponentProps<"div">): JSX.Element;
declare function ToastActions(props: ComponentProps<"div">): JSX.Element;
declare function ToastCloseButton(props: ToastCloseButtonProps & ComponentProps<"button">): JSX.Element;
declare function ToastProgressTrack(props: ComponentProps<typeof Kobalte.ProgressTrack>): JSX.Element;
declare function ToastProgressFill(props: ComponentProps<typeof Kobalte.ProgressFill>): JSX.Element;
export declare const Toast: typeof ToastRoot & {
    Region: typeof ToastRegion;
    Icon: typeof ToastIcon;
    Content: typeof ToastContent;
    Title: typeof ToastTitle;
    Description: typeof ToastDescription;
    Actions: typeof ToastActions;
    CloseButton: typeof ToastCloseButton;
    ProgressTrack: typeof ToastProgressTrack;
    ProgressFill: typeof ToastProgressFill;
};
export { toaster };
export type ToastVariant = "default" | "success" | "error" | "loading";
export interface ToastAction {
    label: string;
    onClick: "dismiss" | (() => void);
}
export interface ToastOptions {
    title?: string;
    description?: string;
    icon?: IconProps["name"];
    variant?: ToastVariant;
    duration?: number;
    persistent?: boolean;
    actions?: ToastAction[];
}
export declare function showToast(options: ToastOptions | string): number;
export interface ToastPromiseOptions<T, U = unknown> {
    loading?: JSX.Element;
    success?: (data: T) => JSX.Element;
    error?: (error: U) => JSX.Element;
}
export declare function showPromiseToast<T, U = unknown>(promise: Promise<T> | (() => Promise<T>), options: ToastPromiseOptions<T, U>): number;
