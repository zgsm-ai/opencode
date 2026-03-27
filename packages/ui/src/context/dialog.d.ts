import { type Owner, type ParentProps, type JSX } from "solid-js";
type DialogElement = () => JSX.Element;
type Active = {
    id: string;
    node: JSX.Element;
    dispose: () => void;
    owner: Owner;
    onClose?: () => void;
    setClosing: (closing: boolean) => void;
};
export declare function DialogProvider(props: ParentProps): JSX.Element;
export declare function useDialog(): {
    readonly active: Active | undefined;
    show(element: DialogElement, onClose?: (() => void) | undefined): void;
    close(): void;
};
export {};
