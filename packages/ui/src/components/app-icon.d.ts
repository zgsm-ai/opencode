import type { Component, ComponentProps } from "solid-js";
import type { IconName } from "./app-icons/types";
export type AppIconProps = Omit<ComponentProps<"img">, "src"> & {
    id: IconName;
};
export declare const AppIcon: Component<AppIconProps>;
