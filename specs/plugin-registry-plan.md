# Plugin Registry 实现计划

方案文档：[docs/PLUGIN_REGISTRY.md](../docs/PLUGIN_REGISTRY.md)
分支：`feature/plugin-registry`

## 进度

- [x] 创建计划文档
- [x] `src/costrict/registry/types.ts` — 类型定义
- [x] `src/costrict/registry/client.ts` — 带认证的 HTTP 客户端
- [x] `src/costrict/registry/record.ts` — 本地已安装记录管理
- [x] `src/costrict/registry/install.ts` — 各类型安装逻辑
- [x] `src/skill/discovery.ts` — 扩展支持带 token 的 fetch
- [x] `src/cli/cmd/plugin.ts` — CLI 命令入口（add/remove/list/update）
- [x] 注册 plugin 命令到 `src/index.ts`
- [x] typecheck 验证通过

## 文件结构

```
packages/opencode/src/
  costrict/
    registry/
      types.ts      ← RegistryItem、IndexJson、InstalledRecord 等类型
      client.ts     ← resolveAuth() + 带认证的 fetch 封装
      record.ts     ← installed-plugins.json 读写
      install.ts    ← skill/subagent/command/mcp 各自安装逻辑
  skill/
    discovery.ts    ← 扩展：pull(url, token?) 支持可选 token
  cli/
    cmd/
      plugin.ts     ← cs plugin add/remove/list/update
```

## 关键设计

### 认证判断流程（client.ts）

```
resolveAuth(url)
  → parseRegistryOrg(url)  → 解析 {origin, org}
  → 读缓存 ~/.cache/costrict/registry-access/{host}-{org}.json（1小时有效）
  → 若无缓存：GET /registry/{org}/access → { public: boolean }
  → public=true  → return undefined（不需要 token）
  → public=false → loadCoStrictCredentials()
                   → 无凭证：throw NotLoggedInError
                   → token 过期：refreshCoStrictToken() → 失败 throw NotLoggedInError
                   → 有效：return access_token
```

### index.json 格式（types.ts）

```ts
type RegistryItem =
  | { slug, type: "skill"|"subagent"|"command", name, description, files: string[] }
  | { slug, type: "mcp", name, description, mcp: Config.Mcp }

type IndexJson = { version: 1; items: RegistryItem[] }
```

### 各类型安装目标（install.ts）

| 类型 | 全局路径 | 项目路径 | config 变更 |
|------|---------|---------|------------|
| skill | `~/.cache/costrict/skills/{slug}/` | 同左（缓存统一） | `skills.urls[]` 追加注册表 URL |
| subagent | `~/.config/costrict/agent/{slug}.md` | `.costrict/agent/{slug}.md` | 无 |
| command | `~/.config/costrict/commands/{slug}.md` | `.costrict/commands/{slug}.md` | 无 |
| mcp | — | — | `mcp.{slug}` 写入 costrict.json |

### 本地记录格式（record.ts）

```ts
type InstalledRecord = {
  items: Array<{
    slug: string
    type: "skill" | "subagent" | "command" | "mcp"
    name: string
    registry: string
    scope: "global" | "project"
    installedAt: string
  }>
}
// 路径：~/.config/costrict/installed-plugins.json
```

## 错误类型

| 错误 | 场景 |
|------|------|
| `NotLoggedInError` | 无凭证或刷新失败 |
| `UnauthorizedError` | token 无效（401） |
| `ForbiddenError` | 无权限（403） |
| `AlreadyInstalledError` | 已安装，提示用 update |
