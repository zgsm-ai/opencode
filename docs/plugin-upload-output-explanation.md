# `cs.exe plugin upload` 命令输出版本和ID号的原因分析

## 问题描述

执行命令：
```bash
.\packages\opencode\dist\@costrict\cs-windows-x64\bin\cs.exe plugin upload
```

输出结果：
```
3.0.7 (commit: 3dfec32f4, built: 2026/03/19 01:24:30)
```

用户反馈看到版本和ID号输出，想了解原因。

---

## 原因分析

### 1. 版本信息的来源

版本信息的输出来自 CLI 入口文件的 yargs 配置：

**文件位置**: [`packages/opencode/src/index.ts:61-65`](packages/opencode/src/index.ts:61)

```typescript
.version(
  "version",
  "show version number",
  `${Installation.VERSION} (commit: ${Installation.COMMIT_HASH}, built: ${Installation.BUILD_TIME})`,
)
```

版本信息包含三个部分：
- **VERSION**: 版本号（如 `3.0.7`）
- **COMMIT_HASH**: Git 提交哈希（如 `3dfec32f4`）
- **BUILD_TIME**: 编译时间（如 `2026/03/19 01:24:30`）

### 2. 版本信息的定义位置

版本常量定义在 [`packages/opencode/src/installation/index.ts:217-220`](packages/opencode/src/installation/index.ts:217)：

```typescript
export const VERSION = typeof COSTRICT_VERSION === "string" ? COSTRICT_VERSION : "1.0.0"
export const CHANNEL = typeof COSTRICT_CHANNEL === "string" ? COSTRICT_CHANNEL : "1.0.0"
export const COMMIT_HASH = typeof COSTRICT_COMMIT_HASH === "string" ? COSTRICT_COMMIT_HASH : "unknown"
export const BUILD_TIME = typeof COSTRICT_BUILD_TIME === "string" ? COSTRICT_BUILD_TIME : "unknown"
```

这些值是在编译时通过 Bun 的 `define` 配置注入的全局变量。

### 3. 为什么显示版本信息

CLI 启动时输出版本信息是**正常行为**，可能的原因有：

#### 情况 A: 使用了 `--version` 或 `-v` 参数

如果命令无意中包含了版本参数，会直接输出版本：
```bash
cs.exe --version
cs.exe -v
```

#### 情况 B: 命令执行成功后的输出

如果 `plugin upload` 命令成功执行，会输出包含版本信息的成功结果。

成功输出的格式在 [`packages/opencode/src/cli/cmd/plugin.ts:194-206`](packages/opencode/src/cli/cmd/plugin.ts:194) 中定义：

```typescript
function formatUploadResult(registry, item, artifact): string {
  const lines = [
    `✓ Upload successful!`,
    ``,
    `Registry: ${registry.name}`,
    `Item: ${item.slug} (${item.name})`,
    `Type: ${item.itemType}`,
    `Version: ${item.version}`,       // ← 版本号
    `Artifact ID: ${artifact.id}`,     // ← ID号
    `File: ${artifact.filename} (${(artifact.fileSize / 1024).toFixed(1)} KB)`,
  ]
  return lines.join("\n")
}
```

完整的成功输出示例：
```
✓ Upload successful!

Registry: public
Item: my-skill (My Skill)
Type: skill
Version: 1.0.0
Artifact ID: art_abc123xyz
File: plugin.zip (2.5 KB)
```

### 4. 版本信息输出的时机

| 场景 | 输出来源 | 说明 |
|------|----------|------|
| CLI 启动 | yargs `--version` | 显式请求版本信息 |
| 上传成功 | `formatUploadResult()` | 成功后的结果摘要 |
| 非交互模式 | `logNonInteractive()` | 执行过程日志 |

---

## 验证方法

### 检查当前版本

```bash
# 查看 CLI 版本
cs.exe --version

# 预期输出示例
# 3.0.7 (commit: 3dfec32f4, built: 2026/03/19 01:24:30)
```

### 检查命令执行状态

如果要确认 `plugin upload` 是否正确执行，可以：

1. **查看完整输出**
   ```bash
   cs.exe plugin upload <path> 2>&1
   ```

2. **检查退出码**
   ```bash
   cs.exe plugin upload <path>
   echo $?
   # 0 = 成功, 非0 = 失败
   ```

3. **添加详细日志**
   ```bash
   cs.exe plugin upload <path> --print-logs --log-level DEBUG
   ```

---

## 总结

1. **版本信息输出是正常行为**：`cs.exe` 会在 `--version` 参数或成功执行后输出版本
2. **版本来自编译时注入**：VERSION、COMMIT_HASH、BUILD_TIME 在构建时确定
3. **Artifact ID 是上传成功的标志**：如果看到 `Artifact ID: xxx`，说明插件已成功上传到注册表
4. **如需帮助可添加 `--help`**：
   ```bash
   cs.exe plugin upload --help
   ```
