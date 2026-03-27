import type { SpringOptions } from "motion";
type Opt = Partial<Pick<SpringOptions, "visualDuration" | "bounce" | "stiffness" | "damping" | "mass" | "velocity">>;
export declare function useSpring(target: () => number, options?: Opt | (() => Opt)): import("solid-js").Accessor<number>;
export {};
