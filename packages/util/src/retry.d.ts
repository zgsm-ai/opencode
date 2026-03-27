export interface RetryOptions {
    attempts?: number;
    delay?: number;
    factor?: number;
    maxDelay?: number;
    retryIf?: (error: unknown) => boolean;
}
export declare function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
