import { WorkerPoolManager } from "@pierre/diffs/worker";
export type WorkerPoolStyle = "unified" | "split";
export declare function workerFactory(): Worker;
export declare function getWorkerPool(style: WorkerPoolStyle | undefined): WorkerPoolManager | undefined;
export declare function getWorkerPools(): {
    unified: WorkerPoolManager | undefined;
    split: WorkerPoolManager | undefined;
};
