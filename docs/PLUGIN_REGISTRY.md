# Plugin Registry 安装方案

## 背景

costrict-web 作为技能商店，托管四类扩展数据：**skill**、**subagent**、**command**、**mcp**。
本方案描述如何通过 `cs plugin` 命令从技能商店安装这些扩展，并处理公开与私有扩展的权限问题。

---

## 一、命令设计

```bash
cs plugin add [slug]                        # 交互式选择或直接指定
cs plugin add [slug] --registry <url>       # 指定注册表
cs plugin remove [slug]                     # 移除已安装扩展
cs plugin list                              # 列出已安装扩展
cs plugin update [slug]                     # 重新拉取（skill / subagent / command）
```

---

## 二、注册表 URL 结构约定

技能商店的注册表 URL 遵循以下路径结构：

```
https://{host}/registry/{org}/
```

示例：

```
https://costrict.ai/registry/public/          # 公开注册表
https://costrict.ai/registry/sangfor/         # 组织私有注册表
https://my-costrict.corp/registry/internal/   # 私有化部署
```

每个注册表下有两个固定接口：

| 接口 | 说明 |
|------|------|
| `GET /registry/{org}/access` | 探测该注册表是否需要认证 |
| `GET /registry/{org}/index.json` | 获取该注册表的扩展目录 |
| `GET /api/items/{id}/download` | 下载具体扩展文件（受权限控制） |

---

## 三、认证判断流程

### 3.1 URL 解析

`Discovery.pull(url)` 入口处，先尝试从 URL 拆解 org 信息：

```ts
function parseRegistryOrg(url: string): { origin: string; org: string } | null {
  const u = new URL(url)
  const match = u.pathname.match(/^\/registry\/([^/]+)/)
  if (!match) return null
  return { origin: u.origin, org: match[1] }
}
```

- 能解析出 org → 走探测流程
- 解析不出（第三方 URL、旧格式）→ 匿名拉取，向后兼容

### 3.2 `/access` 探测接口

```
GET /registry/{org}/access
（匿名请求，无需 token）
```

响应：

```json
{ "public": true }
```

或：

```json
{ "public": false }
```

**设计要点：**

- org 不存在时也返回 `{ "public": false }`，而非 404，避免泄露 org 是否存在
- 该接口本身不暴露任何扩展内容，只表达"是否需要认证"

### 3.3 完整判断流程

```
Discovery.pull(url)
        │
        ▼
parseRegistryOrg(url)
        │
        ├── 解析失败（非 /registry/{org} 结构）
        │       └── 匿名拉取 index.json（向后兼容）
        │
        └── 解析成功 → GET /registry/{org}/access
                │
                ├── { public: true }
                │       └── 匿名拉取 index.json
                │
                └── { public: false }
                        │
                        ▼
                loadCoStrictCredentials()
                        │
                        ├── 无凭证
                        │       └── 抛出 NotLoggedInError
                        │
                        ├── token 已过期
                        │       └── refreshCoStrictToken() → 失败则抛出 NotLoggedInError
                        │
                        └── 有效 token
                                └── 带 Authorization: Bearer <token> 拉取 index.json
                                        │
                                        ├── 200 → 继续安装
                                        ├── 401 → 抛出 UnauthorizedError
                                        └── 403 → 抛出 ForbiddenError
```

### 3.4 探测结果缓存

`/access` 探测结果缓存到本地，避免每次启动都额外发起请求：

- 缓存路径：`~/.cache/costrict/registry-access/{host}-{org}.json`
- 缓存有效期：1 小时
- 缓存结构：`{ "public": boolean, "cachedAt": number }`

---

## 四、index.json 结构

每个注册表独立维护自己的 `index.json`，只包含该注册表下有权访问的条目（后端按 token 过滤）。

```json
{
  "version": 1,
  "items": [
    {
      "slug": "code-reviewer",
      "type": "skill",
      "name": "Code Reviewer",
      "description": "专业代码审查技能",
      "files": ["SKILL.md"]
    },
    {
      "slug": "test-runner",
      "type": "subagent",
      "name": "Test Runner",
      "description": "自动化测试执行代理",
      "files": ["agent.md"]
    },
    {
      "slug": "git-review",
      "type": "command",
      "name": "Git Review",
      "description": "Git 变更审查命令",
      "files": ["command.md"]
    },
    {
      "slug": "my-internal-tool",
      "type": "mcp",
      "name": "My Internal Tool",
      "description": "内部工具 MCP Server",
      "mcp": {
        "type": "local",
        "command": ["npx", "-y", "@internal/my-tool"]
      }
    }
  ]
}
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| `slug` | 唯一标识，用于安装/移除命令 |
| `type` | `skill` / `subagent` / `command` / `mcp` |
| `files` | 需要下载的文件列表（skill/subagent/command 使用） |
| `mcp` | MCP 配置对象（type=mcp 时使用，直接写入 costrict.json） |

---

## 五、各类型安装策略

### 5.1 skill

1. 调用 `Discovery.pull(url)` 下载文件到缓存目录 `~/.cache/costrict/skills/{slug}/`
2. 将注册表 URL 写入 `costrict.json` 的 `skills.urls[]`
3. 运行时自动加载，始终保持最新

```json
{
  "skills": {
    "urls": ["https://costrict.ai/registry/sangfor"]
  }
}
```

### 5.2 subagent

1. 下载 `agent.md` 到目标目录
   - 全局：`~/.config/costrict/agent/{slug}.md`
   - 项目：`.costrict/agent/{slug}.md`
2. 无需修改 config，Agent 扫描器自动发现

### 5.3 command

1. 下载 `command.md` 到目标目录
   - 全局：`~/.config/costrict/commands/{slug}.md`
   - 项目：`.costrict/commands/{slug}.md`
2. 无需修改 config，Command 扫描器自动发现

### 5.4 mcp

1. 从 `index.json` 中读取 `item.mcp` 配置对象
2. 复用 `addMcpToConfig(name, mcpConfig, configPath)` 写入 `costrict.json`

```json
{
  "mcp": {
    "my-internal-tool": {
      "type": "local",
      "command": ["npx", "-y", "@internal/my-tool"]
    }
  }
}
```

---

## 六、本地已安装记录

维护一个本地 registry 文件，支持 `list` 和 `remove` 命令：

**路径：** `~/.config/costrict/installed-plugins.json`

```json
{
  "items": [
    {
      "slug": "code-reviewer",
      "type": "skill",
      "name": "Code Reviewer",
      "registry": "https://costrict.ai/registry/sangfor",
      "scope": "global",
      "installedAt": "2026-03-10T10:00:00Z"
    },
    {
      "slug": "my-internal-tool",
      "type": "mcp",
      "name": "My Internal Tool",
      "registry": "https://costrict.ai/registry/sangfor",
      "scope": "project",
      "installedAt": "2026-03-10T11:00:00Z"
    }
  ]
}
```

---

## 七、错误处理

| 错误 | 提示信息 |
|------|---------|
| `NotLoggedInError` | `This registry requires authentication. Run: cs auth login` |
| `UnauthorizedError` | `Authentication failed. Run: cs auth login to re-authenticate` |
| `ForbiddenError` | `You don't have access to this registry. Contact your organization admin` |
| 网络错误 | `Failed to reach registry: {url}` |
| 文件已存在 | `{slug} is already installed. Run: cs plugin update {slug}` |

---

## 八、新增文件结构

```
packages/opencode/src/
  costrict/
    registry/
      client.ts       # 带认证的 HTTP 客户端（封装 fetch + token 管理）
      types.ts        # IndexJson、Item、RegistryAccess 等类型定义
      install.ts      # 各类型安装逻辑（skill/subagent/command/mcp）
      record.ts       # 本地已安装记录管理（installed-plugins.json）
  skill/
    discovery.ts      # 扩展：resolveAuth(url) 前置步骤 + 带 token 的 fetch
  cli/
    cmd/
      plugin.ts       # CLI 命令入口（add/remove/list/update）
```

### client.ts 核心逻辑

```ts
async function resolveAuth(url: string): Promise<string | undefined> {
  const parsed = parseRegistryOrg(url)
  if (!parsed) return undefined

  const cached = await readAccessCache(parsed)
  const isPublic = cached ?? await fetchAccess(parsed)

  if (isPublic) return undefined

  const credentials = await loadCoStrictCredentials()
  if (!credentials) throw new NotLoggedInError()

  if (!isCoStrictTokenValid(credentials)) {
    const refreshed = await refreshCoStrictToken({ ... }).catch(() => null)
    if (!refreshed) throw new NotLoggedInError()
    return refreshed.access_token
  }

  return credentials.access_token
}
```

---

## 九、与现有代码的关系

| 现有模块 | 复用方式 |
|---------|---------|
| `skill/discovery.ts` | 扩展 `pull()` 支持可选 token 参数 |
| `costrict/provider/credentials.ts` | 直接调用 `loadCoStrictCredentials()` |
| `costrict/provider/token.ts` | 直接调用 `isCoStrictTokenValid()` + `refreshCoStrictToken()` |
| `cli/cmd/mcp.ts` 中的 `addMcpToConfig()` | MCP 类型安装时复用 |
| `cli/cmd/mcp.ts` 中的 `resolveConfigPath()` | 确定写入路径时复用 |
| `config/config.ts` 中的 `Skills` schema | 无需修改，`urls[]` 已支持 |

---

## 十、costrict-web 需要配合的工作

| 接口 | 说明 |
|------|------|
| `GET /registry/{org}/access` | 新增，返回 `{ public: boolean }`，org 不存在时也返回 false |
| `GET /registry/{org}/index.json` | 新增，按 token 过滤返回有权访问的条目 |
| `GET /api/items/{id}/download` | 已有（参考 SKILL_DATA_DESIGN.md），确保鉴权逻辑完整 |
