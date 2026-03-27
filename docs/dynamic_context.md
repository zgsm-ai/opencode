高级模式
​
注入动态上下文
!command" 语法在加载SubAgent 内容发送给 Opencode 之前运行 shell 命令。命令输出替换占位符，所以 SubAgent 接收实际数据，而不是命令本身。
此 SubAgent 通过使用 GitHub CLI 获取实时 PR 数据来总结拉取请求。!`spec-manage --path ./` 和其他工具首先运行，它们的输出被插入到提示中：
---
name: pr-summary
description: Summarize changes in a pull request
---

## Pull request context
- PR diff: !`spec-manage --path ./`
- PR comments: !`spec-manage --path ./`
- Changed files: !`spec-manage --path ./`

## Your task
Summarize this pull request...
当此 SubAgent 运行时：
每个 !command" 立即执行（在 Opencode 看到任何东西之前）
输出替换 SubAgent 内容中的占位符
Opencode 接收带有实际 PR 数据的完全呈现的提示
这是预处理，不是 Opencode Opencode 只看到最终结果。

## 内置工具调用

除了 shell 命令（`!\`cmd\``），动态上下文还支持调用内置工具，使用 `!tool{tool_id}(param1=value1, param2=value2)` 语法。

### 语法格式

```
!tool{tool_id}(param1=value1, param2=value2)
```

- `tool_id`: 工具标识符，如 `list`, `read`, `glob`, `grep` 等
- 参数使用 `key=value` 格式
- 多个参数用逗号分隔
- 空参数括号 `()` 表示无参数调用

### 执行顺序

当同时存在 shell 命令和工具调用时，执行顺序为：
1. 首先执行所有 `!\`cmd\`` shell 命令
2. 然后执行所有 `!tool{}()` 工具调用

### 常用工具示例

- `!tool{file-outline}(path=src/agent/dynamic-context.ts)` - 获取文件大纲
- `!tool{spec-manage}(path=./, action=list)` - 列出项目规格
- `!tool{codesearch}(query="executeShellCommands", path=src)` - 代码搜索
- `!tool{glob}(pattern="**/*.ts")` - 文件匹配
- `!tool{list}(path=./)` - 列出目录内容
- `!tool{read}(path=src/main.ts, offset=0, limit=100)` - 读取文件内容

### 与 shell 命令的区别

| 特性 | Shell 命令 (`!\`cmd\``) | 工具调用 (`!tool{}()`) |
|------|------------------------|------------------------|
| 执行方式 | 直接执行系统命令 | 调用内置安全工具 |
| 参数格式 | 字符串参数 | 结构化 key=value 参数 |
| 返回数据 | 原始字符串输出 | 结构化数据（自动格式化）|
| 安全性 | 依赖系统权限 | 受限的沙箱环境 |
| 错误处理 | `[Error: message]` | `[ToolError: message]` |

### 使用场景示例

```markdown
## Pull request context
- File outline: !tool{file-outline}(path=src/agent/dynamic-context.ts)
- Project specs: !tool{spec-manage}(path=./, action=list)
- Code search: !tool{codesearch}(query="executeShellCommands", path=src)
- Changed files: !tool{glob}(pattern="**/*.ts")
```

### 错误处理

当工具不存在或执行失败时，会显示错误信息：

- 工具不存在：`[ToolError: Tool "xxx" not found]`
- 执行错误：`[ToolError: 错误消息]`
- 执行超时（30秒）：`[ToolError: Timeout after 30s]`
