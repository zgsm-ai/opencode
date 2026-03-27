# `cs.exe plugin upload` 命令实现文档

## 概述

`cs.exe plugin upload` 命令用于将本地插件目录打包并上传到插件注册表（Registry）。支持交互式和非交互式两种执行模式。

---

## 命令定义

```typescript
// packages/opencode/src/cli/cmd/plugin.ts:420-598
const PluginUploadCommand = cmd({
  command: "upload [path]",
  describe: "upload a plugin to the registry",
  builder: (yargs) =>
    yargs
      .positional("path", { type: "string", describe: "plugin directory path", default: "." })
      .option("registry", { type: "string", describe: "registry name" })
      .option("slug", { type: "string", describe: "item slug" })
      .option("name", { type: "string", describe: "display name" })
      .option("type", { type: "string", describe: "item type", choices: ["skill", "subagent", "command", "hook", "mcp", "plugin"], default: "skill" })
      .option("version", { type: "string", describe: "version", default: "1.0.0" })
      .option("description", { type: "string", describe: "description" })
      .option("category", { type: "string", describe: "category" }),
  async handler(args) { ... }
})
```

---

## 命令参数

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `path` | string | 否 | `.` | 插件目录路径 |
| `--registry` | string | 否 | `public` | 注册表名称 |
| `--slug` | string | 否* | 从 metadata 读取 | 插件唯一标识 |
| `--name` | string | 否* | 从 metadata 读取 | 显示名称 |
| `--type` | string | 否 | `skill` | 插件类型: skill, subagent, command, hook, mcp, plugin |
| `--version` | string | 否 | `1.0.0` | 版本号 |
| `--description` | string | 否 | - | 描述信息 |
| `--category` | string | 否 | - | 分类 |

*注：非交互模式下必需提供 `--slug` 和 `--name`

---

## 执行流程

```mermaid
flowchart TD
    A[开始] --> B[解析命令参数]
    B --> C{非交互模式?}
    C -->|是| D[检查必需参数]
    C -->|否| E[交互式提示缺失参数]
    D -->|缺少参数| F[输出错误并退出]
    D -->|参数完整| G[验证插件目录]
    E --> G
    G -->|验证失败| H[输出错误并退出]
    G -->|验证成功| I[打包插件为 tar.gz]
    I -->|打包失败| J[输出错误并退出]
    I -->|打包成功| K[读取 SKILL.md]
    K --> L[解析/创建 Registry]
    L -->|失败| M[输出错误并退出]
    L -->|成功| N[创建 Item]
    N -->|失败| O[输出错误并退出]
    N -->|成功| P[上传 Artifact]
    P -->|失败| Q[输出错误并退出]
    P -->|成功| R[显示成功信息]
    R --> S[结束]
```

---

## 核心步骤详解

### 1. 参数解析与验证

**位置**: `packages/opencode/src/cli/cmd/plugin.ts:94-166`

```typescript
interface UploadOptions {
  path: string           // 插件目录绝对路径
  registry?: string      // 注册表名称
  slug?: string          // 插件唯一标识
  name?: string          // 显示名称
  type: RegistryItemType // 插件类型
  version: string        // 版本号
  description?: string   // 描述
  category?: string      // 分类
}
```

**非交互模式处理**:
- 通过 `process.stdout.isTTY && process.stdin.isTTY` 判断是否交互模式
- 非交互模式下缺少必需参数时，输出错误到 stderr 并退出

### 2. 插件验证

**位置**: `packages/opencode/src/costrict/registry/pack.ts:74-129`

**验证逻辑**:
1. 检查目录是否存在
2. 检查是否为目录类型
3. 扫描目录获取文件列表
4. 检查必需文件（SKILL.md 或 plugin.json）
5. 验证 SKILL.md 不为空
6. 验证 plugin.json 格式

**错误类型**:
```typescript
class PackValidationError extends Error {
  field?: string  // 错误字段
}
```

### 3. 插件打包

**位置**: `packages/opencode/src/costrict/registry/pack.ts:214-276`

**打包流程**:
1. 再次验证插件目录
2. 创建输出目录（`~/.cache/opencode/plugin-uploads/`）
3. 扫描所有文件
4. 创建 tar 格式数据
   - 生成 tar 头（512 字节）
   - 添加文件内容
   - 填充到 512 字节边界
5. 使用 gzip 压缩
6. 计算 SHA256 校验和

**输出格式**: `{plugin-name}-{timestamp}.tar.gz`

### 4. Registry 解析/创建

**位置**: `packages/opencode/src/costrict/registry/client.ts:123-163`

**API 调用**:
```http
POST /api/registries
Content-Type: application/json
Authorization: Bearer {token}

{
  "name": "registry-name",
  "description": "Registry for {name}",
  "sourceType": "local",
  "visibility": "public",
  "ownerId": "cli-user",
  "syncEnabled": false
}
```

### 5. Item 创建

**位置**: `packages/opencode/src/costrict/registry/client.ts:165-206`

**API 调用**:
```http
POST /api/registries/{registryId}/items
Content-Type: application/json
Authorization: Bearer {token}

{
  "slug": "my-skill",
  "itemType": "skill",
  "name": "My Skill",
  "description": "...",
  "category": "general",
  "version": "1.0.0",
  "content": "SKILL.md 内容",
  "createdBy": "cli-user"
}
```

### 6. Artifact 上传

**位置**: `packages/opencode/src/costrict/registry/client.ts:208-281`

**API 调用**:
```http
POST /api/artifacts/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: {tar.gz 文件}
item_id: {itemId}
version: {version}
```

**进度回调**:
```typescript
onProgress?: (loaded: number, total: number) => void
```

---

## 非交互模式输出支持

**位置**: `packages/opencode/src/cli/cmd/plugin.ts:52-80`

为确保非 TTY 环境下也能看到执行进度，实现了以下辅助函数：

```typescript
// 普通日志输出
function logNonInteractive(message: string, isInteractive: boolean): void

// 错误信息输出
function errorNonInteractive(message: string, isInteractive: boolean): void

// Spinner 开始输出
function logSpinnerStart(message: string, isInteractive: boolean): void

// Spinner 结束输出
function logSpinnerStop(message: string, isInteractive: boolean, isError?: boolean): void
```

**输出示例**（非交互模式）:
```
Upload extension

Validating plugin...
Plugin validated

Packing plugin...
Plugin packed (2.5 KB)

Resolving registry...
Registry resolved: public

Creating item...
Item created: my-skill

Uploading artifact...
Artifact uploaded

✓ Upload successful!

Registry: public
Item: my-skill (My Skill)
Type: skill
Version: 1.0.0
Artifact ID: xxx
File: plugin.zip (2.5 KB)

Done
```

---

## 错误处理

### 错误类型定义

**位置**: `packages/opencode/src/costrict/registry/types.ts`

```typescript
class NotLoggedInError extends Error {}
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
class AlreadyInstalledError extends Error {}
class PackValidationError extends Error {
  field?: string
}
class SkillNotFoundError extends Error {}
class PackError extends Error {}
```

### 错误格式化

**位置**: `packages/opencode/src/cli/cmd/plugin.ts:31-40`

```typescript
function formatError(err: unknown): string {
  if (err instanceof NotLoggedInError) return err.message
  if (err instanceof UnauthorizedError) return err.message
  if (err instanceof ForbiddenError) return err.message
  if (err instanceof AlreadyInstalledError) return err.message
  if (err instanceof PackValidationError) return err.field ? `${err.message} (${err.field})` : err.message
  if (err instanceof SkillNotFoundError) return err.message
  if (err instanceof PackError) return err.message
  return err instanceof Error ? err.message : String(err)
}
```

---

## 工具函数

### 文件大小格式化

```typescript
function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const unit = units[Math.min(i, units.length - 1)]
  const value = bytes / Math.pow(k, i)
  return `${value.toFixed(1)} ${unit}`
}
```

### Registry URL 解析

```typescript
function resolveRegistryUrl(slug: string | undefined): { 
  registryUrl: string
  itemSlug: string | undefined 
} {
  const base = registryBase()  // 默认: https://code.claude.com/registry
  if (!slug) return { registryUrl: `${base}/public`, itemSlug: undefined }
  const sep = slug.indexOf("/")
  if (sep === -1) return { registryUrl: `${base}/public`, itemSlug: slug }
  return { registryUrl: `${base}/${slug.slice(0, sep)}`, itemSlug: slug.slice(sep + 1) }
}
```

---

## 文件结构

### 相关文件

```
packages/opencode/src/
├── cli/cmd/plugin.ts           # 命令定义与处理器
├── costrict/registry/
│   ├── client.ts               # HTTP API 客户端
│   ├── pack.ts                 # 插件打包与验证
│   ├── types.ts                # 类型定义与错误类
│   └── install.ts              # 安装逻辑（供 add 使用）
```

### 核心接口

```typescript
// types.ts - CreateRegistryResponse
interface CreateRegistryResponse {
  id: string
  name: string
  description: string
  sourceType: string
  visibility: string
  ownerId: string
  createdAt: string
}

// types.ts - CreateItemResponse
interface CreateItemResponse {
  id: string
  slug: string
  name: string
  itemType: string
  version: string
  description: string
  category: string
  content?: string
}

// types.ts - UploadArtifactResponse
interface UploadArtifactResponse {
  id: string
  filename: string
  fileSize: number
  sha256: string
  itemId: string
  version: string
  createdAt: string
}

// pack.ts - PackResult
interface PackResult {
  archivePath: string  // tar.gz 文件路径
  sha256: string       // 文件 SHA256
  size: number         // 文件大小（字节）
}
```

---

## 使用示例

### 交互模式

```bash
# 上传当前目录的插件
cs.exe plugin upload

# 上传指定目录的插件
cs.exe plugin upload ./my-skill
```

### 非交互模式（CI/CD）

```bash
# 完整参数上传
cs.exe plugin upload ./my-skill \
  --slug my-skill \
  --name "My Skill" \
  --type skill \
  --version 1.0.0 \
  --description "A useful skill" \
  --category general
```

### 使用 plugin.json 自动填充

在插件目录创建 `plugin.json`:

```json
{
  "slug": "my-skill",
  "name": "My Skill",
  "description": "A useful skill",
  "type": "skill",
  "version": "1.0.0"
}
```

然后执行:
```bash
cs.exe plugin upload ./my-skill
```

---

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `COSTRICT_REGISTRY_BASE_URL` | Registry 基础 URL | `https://code.claude.com/registry` |

---

## 依赖说明

### 外部依赖
- `@clack/prompts`: 交互式命令行提示
- `node:crypto`: SHA256 计算
- `node:stream`: 文件流处理
- `node:zlib`: gzip 压缩

### 内部依赖
- `Global.Path.cache`: 缓存目录路径
- `Filesystem`: 文件系统操作工具
- `loadCoStrictCredentials`: 凭证加载
- `resolveToken`: Token 解析与刷新
