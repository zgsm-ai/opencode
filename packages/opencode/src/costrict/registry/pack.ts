import { createHash } from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { mkdir, readdir, stat } from "fs/promises"
import { basename, join, relative } from "path"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import { createGzip } from "zlib"
import { Filesystem } from "../../util/filesystem"
import { PackError, PackValidationError, SkillNotFoundError } from "./types"

export interface PackResult {
  archivePath: string
  sha256: string
  size: number
}

export interface PluginMetadata {
  slug: string
  name: string
  description: string
  version?: string
  type: "skill" | "subagent" | "command" | "hook" | "mcp" | "plugin"
  files: string[]
  skillContent?: string
}

export interface ScannedFile {
  path: string
  relativePath: string
  size: number
  isDirectory: boolean
}

/**
 * 扫描插件目录，返回所有文件列表
 */
export async function scanPluginDirectory(pluginPath: string): Promise<ScannedFile[]> {
  const files: ScannedFile[] = []

  async function scan(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      const relativePath = relative(pluginPath, fullPath)

      if (entry.isDirectory()) {
        files.push({
          path: fullPath,
          relativePath,
          size: 0,
          isDirectory: true,
        })
        await scan(fullPath)
      } else {
        const fileStat = await stat(fullPath)
        files.push({
          path: fullPath,
          relativePath,
          size: fileStat.size,
          isDirectory: false,
        })
      }
    }
  }

  await scan(pluginPath)
  return files
}

/**
 * 验证插件目录结构
 */
export async function validatePlugin(pluginPath: string): Promise<void> {
  // 检查目录是否存在
  const exists = await Filesystem.exists(pluginPath)
  if (!exists) {
    throw new PackValidationError(`Plugin directory does not exist: ${pluginPath}`)
  }

  const isDir = (await Filesystem.isDir(pluginPath))
  if (!isDir) {
    throw new PackValidationError(`Path is not a directory: ${pluginPath}`)
  }

  // 扫描目录获取文件列表
  const files = await scanPluginDirectory(pluginPath)
  const relativePaths = files.map((f) => f.relativePath)

  // 检查是否包含 SKILL.md（对于 skill 类型）
  const hasSkillMd = relativePaths.some((p) => p.toLowerCase() === "skill.md")
  const hasPluginJson = relativePaths.some((p) => p.toLowerCase() === "plugin.json")

  // 如果有 SKILL.md，则认为是 skill 类型，需要验证
  if (hasSkillMd) {
    const skillMdPath = files.find((f) => f.relativePath.toLowerCase() === "skill.md")?.path
    if (skillMdPath) {
      const content = await Filesystem.readText(skillMdPath)
      if (content.trim().length === 0) {
        throw new PackValidationError("SKILL.md is empty", "SKILL.md")
      }
    }
  }

  // 验证 plugin.json 格式（如果存在）
  if (hasPluginJson) {
    const pluginJsonPath = files.find((f) => f.relativePath.toLowerCase() === "plugin.json")?.path
    if (pluginJsonPath) {
      try {
        const json = await Filesystem.readJson(pluginJsonPath)
        if (!json || typeof json !== "object") {
          throw new PackValidationError("plugin.json must be an object", "plugin.json")
        }
        if (!json.name || typeof json.name !== "string") {
          throw new PackValidationError("plugin.json must have a 'name' field", "name")
        }
      } catch (e) {
        if (e instanceof PackValidationError) throw e
        throw new PackValidationError(`Invalid plugin.json: ${e instanceof Error ? e.message : String(e)}`, "plugin.json")
      }
    }
  }

  // 检查必需的文件结构（至少有一个文件）
  const fileEntries = files.filter((f) => !f.isDirectory)
  if (fileEntries.length === 0) {
    throw new PackValidationError("Plugin directory is empty")
  }
}

/**
 * 读取 SKILL.md 内容
 */
export async function readSkillMarkdown(pluginPath: string): Promise<string> {
  const skillMdPath = join(pluginPath, "SKILL.md")
  const exists = await Filesystem.exists(skillMdPath)
  if (!exists) {
    throw new SkillNotFoundError(pluginPath)
  }
  return Filesystem.readText(skillMdPath)
}

/**
 * 计算文件 SHA256 校验和
 */
export async function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(filePath)

    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest("hex")))
    stream.on("error", (err) => reject(new PackError(`Failed to compute SHA256: ${err.message}`)))
  })
}

/**
 * 创建 tar 头缓冲区
 */
function createTarHeader(name: string, size: number, mode: number, isDirectory: boolean): Buffer {
  const header = Buffer.alloc(512)

  // 文件名（100 字节）
  const nameBytes = Buffer.from(name, "utf-8")
  nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100))

  // 文件模式（8 字节）
  const modeStr = mode.toString(8).padStart(6, "0") + "\0"
  Buffer.from(modeStr).copy(header, 100)

  // UID（8 字节）
  Buffer.from("0001750\0").copy(header, 108)

  // GID（8 字节）
  Buffer.from("0001750\0").copy(header, 116)

  // 文件大小（12 字节）
  const sizeStr = size.toString(8).padStart(11, "0") + " "
  Buffer.from(sizeStr).copy(header, 124)

  // 修改时间（12 字节）
  const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + " "
  Buffer.from(mtime).copy(header, 136)

  // 校验和（8 字节）- 先填充空格，后面计算
  Buffer.from("        ").copy(header, 148)

  // 类型标志（1 字节）
  header[156] = isDirectory ? 0x35 : 0x30 // '5' for directory, '0' for file

  // 链接名（100 字节）
  // 留空

  // UStar 指示器（6 字节）
  Buffer.from("ustar\0").copy(header, 257)

  // UStar 版本（2 字节）
  Buffer.from("00").copy(header, 263)

  // 计算校验和
  let sum = 0
  for (let i = 0; i < 512; i++) {
    sum += header[i]
  }
  const checksumStr = sum.toString(8).padStart(6, "0") + "\0 "
  Buffer.from(checksumStr).copy(header, 148)

  return header
}

/**
 * 打包插件为 tar.gz 格式
 */
export async function packPlugin(pluginPath: string, outputDir: string): Promise<PackResult> {
  // 先验证插件
  await validatePlugin(pluginPath)

  // 确保输出目录存在
  await mkdir(outputDir, { recursive: true })

  // 生成输出文件名
  const pluginName = basename(pluginPath)
  const timestamp = Date.now()
  const archiveName = `${pluginName}-${timestamp}.tar.gz`
  const archivePath = join(outputDir, archiveName)

  // 扫描文件
  const files = await scanPluginDirectory(pluginPath)

  // 创建 tar 流
  const tarChunks: Buffer[] = []

  for (const file of files) {
    if (file.isDirectory) continue // 跳过目录，tar 中的文件名隐式表示目录结构

    const content = await Filesystem.readBytes(file.path)

    // 创建文件头（将 Windows 反斜杠替换为正斜杠以符合 tar 标准）
    const entry = file.relativePath.replace(/\\/g, '/')
    const header = createTarHeader(entry, content.length, 0o644, false)
    tarChunks.push(header)

    // 添加文件内容
    tarChunks.push(content)

    // 填充到 512 字节边界
    const padding = 512 - (content.length % 512)
    if (padding < 512) {
      tarChunks.push(Buffer.alloc(padding))
    }
  }

  // 添加两个空的 512 字节块作为结束标记
  tarChunks.push(Buffer.alloc(512))
  tarChunks.push(Buffer.alloc(512))

  // 合并 tar 数据
  const tarBuffer = Buffer.concat(tarChunks)

  // 创建 gzip 压缩流
  const gzip = createGzip()
  const writeStream = createWriteStream(archivePath)

  // 使用 pipeline 进行压缩
  const source = Readable.from([tarBuffer])
  await pipeline(source, gzip, writeStream)

  // 计算 SHA256 和文件大小
  const sha256 = await computeSha256(archivePath)
  const size = await Filesystem.size(archivePath)

  return {
    archivePath,
    sha256,
    size,
  }
}

/**
 * 获取插件元数据
 */
export async function getPluginMetadata(pluginPath: string): Promise<PluginMetadata> {
  // 验证插件
  await validatePlugin(pluginPath)

  // 读取 plugin.json
  let pluginJson: Partial<PluginMetadata> = {}
  const pluginJsonPath = join(pluginPath, "plugin.json")
  const hasPluginJson = await Filesystem.exists(pluginJsonPath)

  if (hasPluginJson) {
    try {
      pluginJson = await Filesystem.readJson<Partial<PluginMetadata>>(pluginJsonPath)
    } catch {
      // 如果读取失败，继续使用默认值
    }
  }

  // 扫描文件列表
  const files = await scanPluginDirectory(pluginPath)
  const filePaths = files.filter((f) => !f.isDirectory).map((f) => f.relativePath)

  // 读取 SKILL.md（如果存在）
  let skillContent: string | undefined
  const skillMdPath = join(pluginPath, "SKILL.md")
  const hasSkillMd = await Filesystem.exists(skillMdPath)

  if (hasSkillMd) {
    try {
      skillContent = await Filesystem.readText(skillMdPath)
    } catch {
      // 如果读取失败，继续
    }
  }

  // 确定类型
  let type: PluginMetadata["type"] = "plugin"
  if (hasSkillMd) {
    type = "skill"
  } else if (pluginJson.type) {
    type = pluginJson.type as PluginMetadata["type"]
  }

  return {
    slug: pluginJson.slug || basename(pluginPath),
    name: pluginJson.name || basename(pluginPath),
    description: pluginJson.description || "",
    version: pluginJson.version,
    type,
    files: filePaths,
    skillContent,
  }
}
