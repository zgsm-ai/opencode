import { type SelectedLineRange } from "@pierre/diffs";
export type DiffSelectionSide = "additions" | "deletions";
export declare function findDiffSide(node: HTMLElement): DiffSelectionSide;
export declare function diffLineIndex(split: boolean, node: HTMLElement): number | undefined;
export declare function diffRowIndex(root: ShadowRoot, split: boolean, line: number, side: DiffSelectionSide | undefined): number | undefined;
export declare function fixDiffSelection(root: ShadowRoot | undefined, range: SelectedLineRange | null): SelectedLineRange | null | undefined;
