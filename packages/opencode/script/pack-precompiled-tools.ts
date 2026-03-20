#!/usr/bin/env bun
/**
 * 打包 rg/fd 预编译工具为 tar.gz 格式
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const root = path.resolve(__dirname, "..", "..", "..");
const source = path.join(root, "trae_agent", "utils", "pre_compiled");
const bundles = path.resolve(__dirname, "..", "resources", "search", "bundles");

const packs: Array<{ name: string; source: string; sources?: string[] }> = [
  {
    name: "precompiled-rg-win32-x64.tar.gz",
    source: "rg/ripgrep-15.1.0-x86_64-pc-windows-msvc",
  },
  {
    name: "precompiled-rg-linux-x64.tar.gz",
    source: "rg/ripgrep-15.1.0-x86_64-unknown-linux-musl",
  },
  {
    name: "precompiled-fd-win32-x64.tar.gz",
    source: "fd/fd-v10.3.0-x86_64-pc-windows-msvc",
  },
  {
    name: "precompiled-fd-linux-x64.tar.gz",
    source: "fd/fd-v10.3.0-x86_64-unknown-linux-gnu",
  },
];

type TarEntry = {
  name: string;
  content: Buffer;
  mode: number;
  dir: boolean;
  size: number;
};

const walk = async (dir: string, base: string): Promise<TarEntry[]> => {
  const entries: TarEntry[] = [];
  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const full = path.join(dir, item.name);
    const rel = path.join(base, item.name).replace(/\\/g, "/");

    if (item.isDirectory()) {
      entries.push({
        name: rel + "/",
        content: Buffer.alloc(0),
        mode: 0o755,
        dir: true,
        size: 0,
      });
      entries.push(...(await walk(full, rel)));
      continue;
    }

    const content = await fs.readFile(full);
    entries.push({
      name: rel,
      content,
      mode: 0o644,
      dir: false,
      size: content.length,
    });
  }

  return entries;
};

const createTar = async (entries: TarEntry[]) => {
  const blocks: Buffer[] = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const name = entry.name;
    if (name.length > 99) {
      throw new Error(`Filename too long: ${name}`);
    }
    header.write(name, 0, name.length, "utf8");

    const modeStr = entry.mode.toString(8).padStart(6, "0") + "\0";
    header.write(modeStr, 100, 8, "utf8");

    header.write("0000000\0", 108, 8, "utf8");
    header.write("0000000\0", 116, 8, "utf8");

    const sizeStr = entry.size.toString(8).padStart(11, "0") + " ";
    header.write(sizeStr, 124, 12, "utf8");

    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + " ";
    header.write(mtime, 136, 12, "utf8");

    header[156] = entry.dir ? 0x35 : 0x30;

    header.fill(0x20, 148, 156);
    const checksum = header.reduce((total, value) => total + value, 0);
    const checksumStr = checksum.toString(8).padStart(6, "0") + "\0 ";
    header.write(checksumStr, 148, 8, "utf8");

    blocks.push(header);

    if (!entry.dir && entry.content.length > 0) {
      blocks.push(entry.content);
      const padding = 512 - (entry.content.length % 512);
      if (padding !== 512) {
        blocks.push(Buffer.alloc(padding, 0));
      }
    }
  }

  blocks.push(Buffer.alloc(512, 0));
  blocks.push(Buffer.alloc(512, 0));

  return Buffer.concat(blocks);
};

const pack = async (name: string, sourcePaths: string[]) => {
  console.log(`📦 Packing ${name}...`);
  const entries: TarEntry[] = [];

  for (const sourcePath of sourcePaths) {
    const full = path.join(source, sourcePath);
    const stat = await fs.stat(full);

    if (stat.isDirectory()) {
      entries.push(...(await walk(full, path.basename(sourcePath))));
      continue;
    }

    const content = await fs.readFile(full);
    entries.push({
      name: path.basename(sourcePath),
      content,
      mode: 0o644,
      dir: false,
      size: content.length,
    });
  }

  const tarBuffer = await createTar(entries);
  const gzipped = Bun.gzipSync(new Uint8Array(tarBuffer));

  const output = path.join(bundles, name);
  await Bun.write(output, gzipped);

  const sizeMB = (gzipped.length / 1024 / 1024).toFixed(2);
  console.log(`  ✓ Created ${name} (${sizeMB} MB)`);
};

const main = async () => {
  await fs.mkdir(bundles, { recursive: true });
  console.log("[pack-precompiled] Packing rg/fd bundles...\n");

  for (const item of packs) {
    const sources = item.sources || [item.source];
    await pack(item.name, sources);
  }

  console.log("\n[pack-precompiled] ✅ All bundles created successfully!");
};

main().catch((err) => {
  console.error("[pack-precompiled] ❌ Error:", err);
  process.exit(1);
});
