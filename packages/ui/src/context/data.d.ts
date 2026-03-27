import type { Message, Session, Part, FileDiff, SessionStatus, ProviderListResponse } from "@opencode-ai/sdk/v2";
import { PreloadMultiFileDiffResult } from "@pierre/diffs/ssr";
type Data = {
    provider?: ProviderListResponse;
    session: Session[];
    session_status: {
        [sessionID: string]: SessionStatus;
    };
    session_diff: {
        [sessionID: string]: FileDiff[];
    };
    session_diff_preload?: {
        [sessionID: string]: PreloadMultiFileDiffResult<any>[];
    };
    message: {
        [sessionID: string]: Message[];
    };
    part: {
        [messageID: string]: Part[];
    };
};
export type NavigateToSessionFn = (sessionID: string) => void;
export type SessionHrefFn = (sessionID: string) => string;
export declare const useData: () => {
    readonly store: Data;
    readonly directory: string;
    navigateToSession: NavigateToSessionFn | undefined;
    sessionHref: SessionHrefFn | undefined;
}, DataProvider: (props: import("solid-js").ParentProps<{
    data: Data;
    directory: string;
    onNavigateToSession?: NavigateToSessionFn | undefined;
    onSessionHref?: SessionHrefFn | undefined;
}>) => import("solid-js").JSX.Element;
export {};
