import type { Component, JSX } from "solid-js";
import type { IconName } from "./file-icons/types";
export type FileIconProps = JSX.GSVGAttributes<SVGSVGElement> & {
    node: {
        path: string;
        type: "file" | "directory";
    };
    expanded?: boolean;
    mono?: boolean;
};
export declare const FileIcon: Component<FileIconProps>;
export declare function chooseIconName(path: string, type: "directory" | "file", expanded: boolean): IconName;
