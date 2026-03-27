import { type Accessor, type ParentProps } from "solid-js";
import { dict as en } from "../i18n/en";
export type UiI18nKey = keyof typeof en;
export type UiI18nParams = Record<string, string | number | boolean>;
export type UiI18n = {
    locale: Accessor<string>;
    t: (key: UiI18nKey, params?: UiI18nParams) => string;
};
export declare function I18nProvider(props: ParentProps<{
    value: UiI18n;
}>): import("solid-js").JSX.Element;
export declare function useI18n(): UiI18n;
