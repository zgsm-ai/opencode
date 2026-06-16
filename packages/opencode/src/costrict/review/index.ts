/**
 * CoStrict Review Module
 *
 * Provides builtin review skills that are embedded
 * in the binary and extracted to cache on first run.
 */

export * as Extension from "./extension"
// @ts-ignore skill/builtin 由构建期下载生成，仓库默认不存在，无需 typecheck
export * as SkillBuiltin from "./skill/builtin"
