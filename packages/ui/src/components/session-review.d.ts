import { type JSX } from "solid-js";
import { type FileContent, type FileDiff } from "@opencode-ai/sdk/v2";
import { PreloadMultiFileDiffResult } from "@pierre/diffs/ssr";
import { type SelectedLineRange } from "@pierre/diffs";
export type SessionReviewDiffStyle = "unified" | "split";
export type SessionReviewComment = {
    id: string;
    file: string;
    selection: SelectedLineRange;
    comment: string;
};
export type SessionReviewLineComment = {
    file: string;
    selection: SelectedLineRange;
    comment: string;
    preview?: string;
};
export type SessionReviewCommentUpdate = SessionReviewLineComment & {
    id: string;
};
export type SessionReviewCommentDelete = {
    id: string;
    file: string;
};
export type SessionReviewCommentActions = {
    moreLabel: string;
    editLabel: string;
    deleteLabel: string;
    saveLabel: string;
};
export type SessionReviewFocus = {
    file: string;
    id: string;
};
type ReviewDiff = FileDiff & {
    preloaded?: PreloadMultiFileDiffResult<any>;
};
export interface SessionReviewProps {
    title?: JSX.Element;
    empty?: JSX.Element;
    split?: boolean;
    diffStyle?: SessionReviewDiffStyle;
    onDiffStyleChange?: (diffStyle: SessionReviewDiffStyle) => void;
    onDiffRendered?: () => void;
    onLineComment?: (comment: SessionReviewLineComment) => void;
    onLineCommentUpdate?: (comment: SessionReviewCommentUpdate) => void;
    onLineCommentDelete?: (comment: SessionReviewCommentDelete) => void;
    lineCommentActions?: SessionReviewCommentActions;
    comments?: SessionReviewComment[];
    focusedComment?: SessionReviewFocus | null;
    onFocusedCommentChange?: (focus: SessionReviewFocus | null) => void;
    focusedFile?: string;
    open?: string[];
    onOpenChange?: (open: string[]) => void;
    scrollRef?: (el: HTMLDivElement) => void;
    onScroll?: JSX.EventHandlerUnion<HTMLDivElement, Event>;
    class?: string;
    classList?: Record<string, boolean | undefined>;
    classes?: {
        root?: string;
        header?: string;
        container?: string;
    };
    actions?: JSX.Element;
    diffs: ReviewDiff[];
    onViewFile?: (file: string) => void;
    readFile?: (path: string) => Promise<FileContent | undefined>;
}
export declare const SessionReview: (props: SessionReviewProps) => JSX.Element;
export {};
