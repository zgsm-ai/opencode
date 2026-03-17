#!/usr/bin/env bun
/**
 * postinstall 脚本：解压平台特定的 rg/fd 预编译包
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(__dirname, "..", "resources", "search");
const bundles = path.join(root, "bundles");
const platform = os.platform();
const arch = os.arch();
const key = `${platform}-${arch}`;

console.log(`[extract-precompiled] Platform: ${platform}, Arch: ${arch}`);

const exists = (file: string) => fs.access(file).then(() => true).catch(() => false);
const stat = (file: string) => fs.stat(file).then((value) => value).catch(() => null);

const parseTool = (name: string) => {
  const match = name.match(/^precompiled-(.+?)-([^-]+)-([^-]+)\.tar\.gz$/);
  if (!match) return "";
  return match[1] || "";
};

const shouldExtract = async (tool: string, bundlePath: string) => {
  const dir = path.join(root, tool);
  const [dirStat, bundleStat] = await Promise.all([stat(dir), stat(bundlePath)]);
  if (!dirStat || !bundleStat) return true;
  return dirStat.mtimeMs < bundleStat.mtimeMs;
};

const extractTarGz = async (archivePath: string, dest: string) => {
  const compressed = await Bun.file(archivePath).arrayBuffer();
  const tarData = Bun.gunzipSync(Buffer.from(compressed));
  const state = { offset: 0 };

  while (state.offset < tarData.length) {
    const header = tarData.subarray(state.offset, state.offset + 512);
    state.offset += 512;

    if (header.every((b) => b === 0)) {
      const next = tarData.subarray(state.offset, state.offset + 512);
      if (next.length === 512 && next.every((b) => b === 0)) return;
      continue;
    }

    const nameEnd = Buffer.from(header).indexOf(0, 0);
    const name = Buffer.from(header.subarray(0, nameEnd === -1 ? 100 : nameEnd)).toString("utf8");

    const sizeBuf = Buffer.from(header.subarray(124, 136));
    const sizeEnd = sizeBuf.indexOf(0);
    const sizeStr = sizeBuf.subarray(0, sizeEnd === -1 ? 12 : sizeEnd).toString("utf8").trim();
    const size = parseInt(sizeStr, 8) || 0;

    const modeBuf = Buffer.from(header.subarray(100, 108));
    const modeEnd = modeBuf.indexOf(0);
    const modeStr = modeBuf.subarray(0, modeEnd === -1 ? 8 : modeEnd).toString("utf8").trim();
    const mode = parseInt(modeStr, 8) || 0o644;

    const typeFlag = String.fromCharCode(header[156] || 0x30);

    if (name && name !== "./" && name !== "/") {
      if (typeFlag === "5") {
        const dirPath = path.join(dest, name);
        await fs.mkdir(dirPath, { recursive: true });
      }

      if (typeFlag === "0" || typeFlag === "\x00") {
        const filePath = path.join(dest, name);
        const fileData = tarData.subarray(state.offset, state.offset + size);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await Bun.write(filePath, fileData);
        await fs.chmod(filePath, mode).catch(() => {});
      }
    }

    state.offset += size;
    const padding = size % 512 === 0 ? 0 : 512 - (size % 512);
    state.offset += padding;
  }
};

const setExecutablePermissions = async (dir: string) => {
  const walk = async (current: string): Promise<void> => {
    const items = await fs.readdir(current, { withFileTypes: true });

    for (const entry of items) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      if (!entry.isFile()) continue;
      const name = entry.name;
      const exec =
        !name.includes(".") ||
        name.endsWith(".exe") ||
        name === "rg" ||
        name === "fd";
      if (!exec) continue;
      await fs.chmod(full, 0o755).catch(() => {});
    }
  };

  await walk(dir);
};

const extractBundle = async (bundleName: string) => {
  const tool = parseTool(bundleName);
  if (!tool) {
    console.log(`[extract-precompiled] ⚠️  Unknown bundle format: ${bundleName}`);
    return;
  }

  const bundlePath = path.join(bundles, bundleName);
  const dest = path.join(root, tool);
  const needs = await shouldExtract(tool, bundlePath);
  if (!needs) {
    console.log(`[extract-precompiled] ✓ ${tool} is up to date`);
    return;
  }

  console.log(`[extract-precompiled] 📦 Extracting ${bundleName}...`);
  await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(dest, { recursive: true });
  await extractTarGz(bundlePath, dest);

  if (platform !== "win32") {
    await setExecutablePermissions(dest);
  }

  console.log(`[extract-precompiled] ✓ ${tool} extracted`);
};

const listBundles = async () => {
  const has = await exists(bundles);
  if (!has) {
    console.log("[extract-precompiled] ⚠️  Bundles directory not found, skipping extraction");
    return [];
  }

  const names = await fs.readdir(bundles);
  return names.filter((name) => name.endsWith(".tar.gz") && name.includes(key));
};

const main = async () => {
  const platformBundles = await listBundles();
  if (platformBundles.length === 0) {
    console.log(`[extract-precompiled] ⚠️  No bundles found for ${key}`);
    const all = await fs.readdir(bundles).catch(() => []);
    if (all.length > 0) {
      console.log("[extract-precompiled] Available bundles:");
      for (const item of all.filter((name) => name.endsWith(".tar.gz"))) {
        console.log(`  - ${item}`);
      }
    }
    process.exit(0);
  }

  console.log(`[extract-precompiled] Found ${platformBundles.length} bundle(s) for current platform`);
  for (const bundle of platformBundles) {
    await extractBundle(bundle);
  }
  console.log("[extract-precompiled] ✅ Extraction complete");
};

main().catch((err) => {
  console.error("[extract-precompiled] ❌ Error:", err);
  console.log("[extract-precompiled] ⚠️  Precompiled tools may not be available");
  process.exit(0);
});
