# 插件上传指南

> 本文档介绍如何将自定义插件上传到 CoStrict 平台

---

## 一、上传流程概述

插件上传需要经历以下三个步骤：

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. 创建注册表   │ → │  2. 创建能力项   │ → │  3. 上传制品   │
│  (Registry)     │    │  (Item)         │    │  (Artifact)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 二、概念说明

### 2.1 注册表 (Registry)

注册表是插件的容器，用于管理一组相关的能力项。你可以将注册表理解为"插件仓库"或"技能集合"。

**支持的来源类型：**
- `upload` - 手动上传
- `sync` - Git 仓库同步

**可见性级别：**
- `public` - 公开，所有用户可见
- `repo` - 仓库级，关联仓库成员可见
- `private` - 私有，仅所有者可见

### 2.2 能力项 (Item)

能力项是注册表中的具体插件单元，代表一个独立的技能/命令/Agent。

**支持的类型：**
| 类型 | 说明 |
|------|------|
| `skill` | Agent Skill（推荐使用的新标准） |
| `subagent` | 子 Agent 定义 |
| `command` | 命令（.md 文件） |
| `hook` | 事件钩子配置 |
| `mcp` | MCP 服务器配置 |
| `plugin` | 插件整体 |

### 2.3 制品 (Artifact)

制品是能力项关联的二进制文件，如压缩包、脚本等。

---

## 三、API 接口说明

### 3.1 创建注册表

**接口：** `POST /api/registries`

**请求体：**
```json
{
  "name": "my-plugins",
  "description": "我的自定义插件集合",
  "sourceType": "upload",
  "visibility": "private",
  "ownerId": "user-123",
  "syncEnabled": false,
  "syncInterval": 0
}
```

**响应示例：**
```json
{
  "id": "registry-uuid",
  "name": "my-plugins",
  "description": "我的自定义插件集合",
  "sourceType": "upload",
  "visibility": "private",
  "ownerId": "user-123",
  "createdAt": "2026-03-17T08:00:00Z"
}
```

---

### 3.2 创建能力项

**接口：** `POST /api/registries/:id/items`

**请求体：**
```json
{
  "slug": "my-awesome-skill",
  "itemType": "skill",
  "name": "我的Awesome技能",
  "description": "这是一个用于演示的Awesome技能",
  "category": "开发工具",
  "version": "1.0.0",
  "content": "# SKILL.md 内容...\n\n这是一个技能的详细描述",
  "createdBy": "user-123"
}
```

**字段说明：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `slug` | string | 是 | URL友好的唯一标识，kebab-case |
| `itemType` | string | 是 | 能力项类型 (skill/subagent/command/hook/mcp/plugin) |
| `name` | string | 是 | 显示名称 |
| `description` | string | 否 | 描述信息 |
| `category` | string | 否 | 分类标签 |
| `version` | string | 否 | 版本号，语义化版本 (如 1.0.0) |
| `content` | string | 否 | SKILL.md 的 Markdown 内容 |
| `createdBy` | string | 是 | 创建者用户ID |

**响应示例：**
```json
{
  "id": "item-uuid",
  "registryId": "registry-uuid",
  "slug": "my-awesome-skill",
  "itemType": "skill",
  "name": "我的Awesome技能",
  "description": "这是一个用于演示的Awesome技能",
  "category": "开发工具",
  "version": "1.0.0",
  "content": "# SKILL.md 内容...",
  "createdBy": "user-123",
  "createdAt": "2026-03-17T08:05:00Z"
}
```

---

### 3.3 上传制品文件

**接口：** `POST /api/artifacts/upload`

**Content-Type：** `multipart/form-data`

**表单字段：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | 要上传的文件 |
| `item_id` | string | 是 | 关联的能力项 ID |
| `version` | string | 否 | 制品版本号 |
| `uploaded_by` | string | 否 | 上传者用户ID（可选，从认证信息获取） |

**响应示例：**
```json
{
  "id": "artifact-uuid",
  "itemId": "item-uuid",
  "filename": "my-skill-v1.0.0.tgz",
  "fileSize": 15360,
  "checksumSha256": "a1b2c3d4e5f6...",
  "mimeType": "application/gzip",
  "artifactVersion": "1.0.0",
  "isLatest": true,
  "uploadedBy": "user-123",
  "createdAt": "2026-03-17T08:10:00Z"
}
```

---

### 3.4 下载制品

**接口：** `GET /api/artifacts/:id/download`

**响应：** 文件二进制流

**响应头：**
- `Content-Disposition: attachment; filename="xxx.tgz"`
- `X-Checksum-SHA256: a1b2c3d4e5f6...`
- `Content-Type: application/octet-stream`

---

## 四、插件目录结构要求

插件必须符合 Claude Code 插件规范。详情请参阅 [CLAUDE_CODE_PLUGIN_SPEC.md](./CLAUDE_CODE_PLUGIN_SPEC.md)。

### 4.1 标准目录结构

```
my-plugin/                          ← 插件根目录
├── .claude-plugin/                 ← 元数据目录（可选）
│   └── plugin.json                 ← 插件清单（可选）
├── skills/                         ← Agent Skills（推荐）
│   ├── my-skill/
│   │   ├── SKILL.md                ← 必须，技能入口
│   │   ├── reference.md            ← 可选，详细参考文档
│   │   └── scripts/                ← 可选，脚本文件
│   │       └── helper.sh
│   └── another-skill/
│       └── SKILL.md
├── commands/                       ← 旧式命令（仍兼容）
│   ├── deploy.md
│   └── status.md
├── agents/                         ← 子 Agent 定义
│   ├── security-reviewer.md
│   └── performance-tester.md
├── hooks/                          ← 事件钩子配置
│   └── hooks.json
├── .mcp.json                       ← MCP 服务器配置
├── .lsp.json                       ← LSP 服务器配置
├── settings.json                   ← 插件默认设置
└── scripts/                        ← 钩子和工具脚本
    ├── format-code.sh
    └── deploy.js
```

### 4.2 plugin.json 清单格式

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"]
}
```

### 4.3 SKILL.md 格式

每个 Skill 是一个目录，`SKILL.md` 是必须的入口文件：

```markdown
---
name: my-skill
description: 技能描述
version: 1.0.0
---

# Skill Name

技能详细描述...

## Tools

- 可以使用的工具列表

## Examples

使用示例...
```

---

## 五、完整上传示例

### 5.1 cURL 示例

```bash
# Step 1: 创建注册表
curl -X POST http://localhost:8080/api/registries \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-plugins",
    "description": "我的自定义插件",
    "sourceType": "upload",
    "visibility": "private",
    "ownerId": "user-123"
  }'

# Step 2: 创建能力项
curl -X POST http://localhost:8080/api/registries/registry-uuid/items \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "my-awesome-skill",
    "itemType": "skill",
    "name": "我的Awesome技能",
    "description": "这是一个用于演示的Awesome技能",
    "category": "开发工具",
    "version": "1.0.0",
    "content": "# SKILL.md\n\n这是一个技能的详细描述",
    "createdBy": "user-123"
  }'

# Step 3: 上传制品
curl -X POST http://localhost:8080/api/artifacts/upload \
  -F "file=@./my-skill-v1.0.0.tgz" \
  -F "item_id=item-uuid" \
  -F "version=1.0.0"
```

### 5.2 JavaScript/TypeScript 示例

```typescript
// 完整的插件上传流程

class PluginUploader {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }
    return response.json();
  }

  // Step 1: 创建注册表
  async createRegistry(name: string, description: string, ownerId: string) {
    return this.request('/api/registries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        sourceType: 'upload',
        visibility: 'private',
        ownerId,
      }),
    });
  }

  // Step 2: 创建能力项
  async createItem(registryId: string, itemData: {
    slug: string;
    itemType: string;
    name: string;
    description?: string;
    version?: string;
    content?: string;
    createdBy: string;
  }) {
    return this.request(`/api/registries/${registryId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itemData),
    });
  }

  // Step 3: 上传制品
  async uploadArtifact(itemId: string, file: File, version?: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('item_id', itemId);
    if (version) {
      formData.append('version', version);
    }

    return this.request('/api/artifacts/upload', {
      method: 'POST',
      body: formData,
    });
  }

  // 完整流程
  async uploadPlugin(options: {
    registryName: string;
    registryDescription: string;
    ownerId: string;
    itemSlug: string;
    itemType: string;
    itemName: string;
    itemDescription?: string;
    itemVersion?: string;
    itemContent?: string;
    artifactFile: File;
  }) {
    // 1. 创建注册表
    const registry = await this.createRegistry(
      options.registryName,
      options.registryDescription,
      options.ownerId
    );

    // 2. 创建能力项
    const item = await this.createItem(registry.id, {
      slug: options.itemSlug,
      itemType: options.itemType,
      name: options.itemName,
      description: options.itemDescription,
      version: options.itemVersion,
      content: options.itemContent,
      createdBy: options.ownerId,
    });

    // 3. 上传制品
    const artifact = await this.uploadArtifact(
      item.id,
      options.artifactFile,
      options.itemVersion
    );

    return { registry, item, artifact };
  }
}

// 使用示例
const uploader = new PluginUploader('http://localhost:8080', 'your-token');

await uploader.uploadPlugin({
  registryName: 'my-plugins',
  registryDescription: '我的自定义插件集合',
  ownerId: 'user-123',
  itemSlug: 'my-awesome-skill',
  itemType: 'skill',
  itemName: '我的Awesome技能',
  itemDescription: '这是一个用于演示的Awesome技能',
  itemVersion: '1.0.0',
  itemContent: '# SKILL.md\n\n技能描述...',
  artifactFile: new File([...], 'my-skill-v1.0.0.tgz'),
});
```

---

## 六、注意事项

### 6.1 命名规范

- **slug**：必须使用 kebab-case（连字符分隔），如 `my-awesome-skill`
- **name**：可以使用中文或英文，长度建议不超过 64 字符
- **version**：遵循语义化版本规范，如 `1.0.0`、`1.2.3-beta`

### 6.2 文件大小限制

- 单个制品文件最大支持根据存储后端配置
- 上传前系统会计算 SHA256 校验和

### 6.3 版本管理

- 上传新版本的制品时，系统会自动将旧版本的 `is_latest` 设为 `false`
- 每次上传都会创建新的版本记录

### 6.4 权限控制

- 创建注册表需要认证
- 上传制品需要对应注册表的写权限
- 下载制品需要对应注册表的读权限

---

## 七、相关文档

- [Claude Code Plugin 规范参考](./CLAUDE_CODE_PLUGIN_SPEC.md)
- [技能数据模型设计](./proposals/SKILL_DATA_DESIGN.md)
- [技能同步设计](./proposals/SKILL_SYNC_DESIGN.md)
- [数据库设计](./DATABASE_DESIGN.md)
