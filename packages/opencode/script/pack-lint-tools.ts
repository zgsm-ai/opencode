#!/usr/bin/env bun
/**
 * 打包 lint 工具为 tar.gz 格式
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const sourceDir = path.resolve(__dirname, "..", "resources", "lint");
const bundlesDir = path.resolve(__dirname, "..", "resources", "lint", "bundles");

// 定义打包配置
const bundles = [
  {
    name: "lint-cpp-linux-x64.tar.gz",
    source: "cpp/clang-tidy-18.1.8-linux-x86_64",
  },
  {
    name: "lint-cpp-win32-x64.tar.gz",
    source: "cpp/clang-tidy-18.1.8-windows-x86_64",
  },
  {
    name: "lint-go-linux-x64.tar.gz",
    sources: ["go/revive_linux_amd64", "go/revive.toml"],
  },
  {
    name: "lint-go-win32-x64.tar.gz",
    sources: ["go/revive_windows_amd64", "go/revive.toml"],
  },
  {
    name: "lint-java-universal.tar.gz",
    source: "java/pmd-7.19.0",
  },
  {
    name: "lint-js-linux-x64.tar.gz",
    source: "js/biome-linux-x64",
  },
  {
    name: "lint-js-win32-x64.tar.gz",
    source: "js/biome-win32-x64",
  },
  {
    name: "lint-py-linux-x64.tar.gz",
    source: "py/ruff-x86_64-unknown-linux-musl",
  },
  {
    name: "lint-py-win32-x64.tar.gz",
    source: "py/ruff-x86_64-pc-windows-msvc",
  },
];

interface TarEntry {
  name: string;
  content: Buffer;
  mode: number;
  isDirectory: boolean;
  size: number;
}

async function walkDir(dir: string, basePath: string): Promise<TarEntry[]> {
  const entries: TarEntry[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relativePath = path.join(basePath, item.name).replace(/\\/g, "/");

    if (item.isDirectory()) {
      entries.push({
        name: relativePath + "/",
        content: Buffer.alloc(0),
        mode: 0o755,
        isDirectory: true,
        size: 0,
      });
      entries.push(...(await walkDir(fullPath, relativePath)));
    } else {
      const content = await fs.readFile(fullPath);
      entries.push({
        name: relativePath,
        content,
        mode: 0o644,
        isDirectory: false,
        size: content.length,
      });
    }
  }

  return entries;
}

async function createTar(entries: TarEntry[]): Promise<Buffer> {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    // 创建 tar 头部（512 字节）
    const header = Buffer.alloc(512, 0);

    // 文件名（0-99）
    const name = entry.name;
    if (name.length > 99) {
      throw new Error(`Filename too long: ${name}`);
    }
    header.write(name, 0, name.length, "utf8");

    // 文件模式（100-107）
    const modeStr = entry.mode.toString(8).padStart(6, "0") + "\0";
    header.write(modeStr, 100, 8, "utf8");

    // UID（108-115）
    header.write("0000000\0", 108, 8, "utf8");

    // GID（116-123）
    header.write("0000000\0", 116, 8, "utf8");

    // 文件大小（124-135）
    const sizeStr = entry.size.toString(8).padStart(11, "0") + " ";
    header.write(sizeStr, 124, 12, "utf8");

    // 修改时间（136-147）
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + " ";
    header.write(mtime, 136, 12, "utf8");

    // 类型标志（156）
    header[156] = entry.isDirectory ? 0x35 : 0x30; // '5' for dir, '0' for file

    // 计算校验和（148-155）先填充空格
    header.fill(0x20, 148, 156);

    // 计算校验和
    const checksum = header.reduce((total, value) => total + value, 0);
    const checksumStr = checksum.toString(8).padStart(6, "0") + "\0 ";
    header.write(checksumStr, 148, 8, "utf8");

    blocks.push(header);

    if (!entry.isDirectory && entry.content.length > 0) {
      blocks.push(entry.content);

      // 填充到 512 字节边界
      const padding = 512 - (entry.content.length % 512);
      if (padding !== 512) {
        blocks.push(Buffer.alloc(padding, 0));
      }
    }
  }

  // 添加两个空块作为结束标记
  blocks.push(Buffer.alloc(512, 0));
  blocks.push(Buffer.alloc(512, 0));

  return Buffer.concat(blocks);
}

async function packBundle(name: string, sourcePaths: string[]) {
  console.log(`📦 Packing ${name}...`);

  const entries: TarEntry[] = [];

  for (const sourcePath of sourcePaths) {
    const fullSourcePath = path.join(sourceDir, sourcePath);
    const stat = await fs.stat(fullSourcePath);

    if (stat.isDirectory()) {
      const dirEntries = await walkDir(fullSourcePath, path.basename(sourcePath));
      entries.push(...dirEntries);
    } else {
      const content = await fs.readFile(fullSourcePath);
      entries.push({
        name: path.basename(sourcePath),
        content,
        mode: 0o644,
        isDirectory: false,
        size: content.length,
      });
    }
  }

  // 创建 tar
  const tarBuffer = await createTar(entries);

  // gzip 压缩
  const gzipped = Bun.gzipSync(new Uint8Array(tarBuffer));

  // 写入文件
  const outputPath = path.join(bundlesDir, name);
  await Bun.write(outputPath, gzipped);

  const sizeMB = (gzipped.length / 1024 / 1024).toFixed(2);
  console.log(`  ✓ Created ${name} (${sizeMB} MB)`);
}

async function main() {
  // 确保 bundles 目录存在
  await fs.mkdir(bundlesDir, { recursive: true });

  console.log("[pack-lint] Packing lint tools...\n");

  for (const bundle of bundles) {
    const sources = bundle.sources || [bundle.source];
    await packBundle(bundle.name, sources);
  }

  console.log("\n[pack-lint] ✅ All bundles created successfully!");
}

main().catch((err) => {
  console.error("[pack-lint] ❌ Error:", err);
  process.exit(1);
});
