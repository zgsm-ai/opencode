import { type JSX } from "solid-js";
export type LineCommentVariant = "default" | "editor" | "add";
export type LineCommentAnchorProps = {
    id?: string;
    top?: number;
    inline?: boolean;
    hideButton?: boolean;
    open: boolean;
    variant?: LineCommentVariant;
    icon?: "comment" | "plus";
    buttonLabel?: string;
    onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
    onMouseEnter?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
    onPopoverFocusOut?: JSX.EventHandlerUnion<HTMLDivElement, FocusEvent>;
    class?: string;
    popoverClass?: string;
    children?: JSX.Element;
};
export declare const LineCommentAnchor: (props: LineCommentAnchorProps) => JSX.Element;
export type LineCommentProps = Omit<LineCommentAnchorProps, "children" | "variant"> & {
    comment: JSX.Element;
    selection: JSX.Element;
    actions?: JSX.Element;
};
export declare const LineComment: (props: LineCommentProps) => JSX.Element;
export type LineCommentAddProps = Omit<LineCommentAnchorProps, "children" | "variant" | "open" | "icon"> & {
    label?: string;
};
export declare const LineCommentAdd: (props: LineCommentAddProps) => JSX.Element;
export type LineCommentEditorProps = Omit<LineCommentAnchorProps, "children" | "open" | "variant" | "onClick"> & {
    value: string;
    selection: JSX.Element;
    onInput: (value: string) => void;
    onCancel: VoidFunction;
    onSubmit: (value: string) => void;
    placeholder?: string;
    rows?: number;
    autofocus?: boolean;
    cancelLabel?: string;
    submitLabel?: string;
};
export declare const LineCommentEditor: (props: LineCommentEditorProps) => JSX.Element;
