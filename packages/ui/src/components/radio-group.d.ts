import { SegmentedControl as Kobalte } from "@kobalte/core/segmented-control";
import type { ComponentProps, JSX } from "solid-js";
export type RadioGroupProps<T> = Omit<ComponentProps<typeof Kobalte>, "value" | "defaultValue" | "onChange" | "children"> & {
    options: T[];
    current?: T;
    defaultValue?: T;
    value?: (x: T) => string;
    label?: (x: T) => JSX.Element | string;
    onSelect?: (value: T | undefined) => void;
    class?: ComponentProps<"div">["class"];
    classList?: ComponentProps<"div">["classList"];
    size?: "small" | "medium";
    fill?: boolean;
    pad?: "none" | "normal";
};
export declare function RadioGroup<T>(props: RadioGroupProps<T>): JSX.Element;
