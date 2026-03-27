export declare function base64Encode(value: string): string;
export declare function base64Decode(value: string): string;
export declare function hash(content: string, algorithm?: string): Promise<string>;
export declare function checksum(content: string): string | undefined;
export declare function sampledChecksum(content: string, limit?: number): string | undefined;
