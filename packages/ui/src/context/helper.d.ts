import { type ParentProps } from "solid-js";
export declare function createSimpleContext<T, Props extends Record<string, any>>(input: {
    name: string;
    init: ((input: Props) => T) | (() => T);
    gate?: boolean;
}): {
    provider: (props: ParentProps<Props>) => import("solid-js").JSX.Element;
    use(): NonNullable<T>;
};
