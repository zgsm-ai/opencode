import type { ValidComponent } from "solid-js";
export declare const FileComponentProvider: (props: import("solid-js").ParentProps<{
    component: ValidComponent;
}>) => import("solid-js").JSX.Element;
export declare const useFileComponent: () => NonNullable<ValidComponent>;
