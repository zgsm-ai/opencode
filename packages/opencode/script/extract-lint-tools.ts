#!/usr/bin/env bun
/**
 * postinstall 脚本：解压平台特定的 lint 工具压缩包
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const lintRoot = path.resolve(__dirname, "..", "resources", "lint");
const bundlesDir = path.join(lintRoot, "bundles");

// 当前平台信息
const currentPlatform = os.platform();
const currentArch = os.arch();

console.log(
	`[extract-lint] Platform: ${currentPlatform}, Arch: ${currentArch}`,
);

async function getBundlesForPlatform(): Promise<string[]> {
	const platformKey = `${currentPlatform}-${currentArch}`;

	try {
		const bundles = await fs.readdir(bundlesDir);

		return bundles.filter((name) => {
			if (!name.endsWith(".tar.gz")) return false;

			// 检查是否匹配当前平台或是通用包
			return name.includes(platformKey) || name.includes("universal");
		});
	} catch {
		return [];
	}
}

async function shouldExtract(
	toolName: string,
	bundlePath: string,
): Promise<boolean> {
	const toolDir = path.join(lintRoot, toolName);

	try {
		const [toolStat, bundleStat] = await Promise.all([
			fs.stat(toolDir),
			fs.stat(bundlePath),
		]);

		// 如果解压目录比压缩包旧，需要重新解压
		return toolStat.mtimeMs < bundleStat.mtimeMs;
	} catch {
		// 解压目录不存在或出错
		return true;
	}
}

async function extractBundle(bundleName: string) {
	const bundlePath = path.join(bundlesDir, bundleName);

	// 从文件名解析工具名
	// lint-{tool}-{platform}-{arch}.tar.gz 或 lint-{tool}-universal.tar.gz
	const match = bundleName.match(
		/^lint-(.+?)-(?:[^-]+-[^-]+|universal)\.tar\.gz$/,
	);
	if (!match) {
		console.log(`[extract-lint] ⚠️  Unknown bundle format: ${bundleName}`);
		return;
	}

	const toolName = match[1];
	const toolDir = path.join(lintRoot, toolName);

	// 检查是否需要解压
	const needsExtract = await shouldExtract(toolName, bundlePath);
	if (!needsExtract) {
		console.log(`[extract-lint] ✓ ${toolName} is up to date`);
		return;
	}

	console.log(`[extract-lint] 📦 Extracting ${bundleName}...`);

	// 清理旧目录
	try {
		await fs.rm(toolDir, { recursive: true, force: true });
	} catch {
		// 忽略清理错误
	}

	// 解压
	await fs.mkdir(toolDir, { recursive: true });
	await extractTarGz(bundlePath, toolDir);

	// 设置可执行权限（Unix 系统）
	if (currentPlatform !== "win32") {
		await setExecutablePermissions(toolDir);
	}

	console.log(`[extract-lint] ✓ ${toolName} extracted`);
}

async function extractTarGz(archivePath: string, destDir: string) {
	// 读取压缩文件
	const compressed = await Bun.file(archivePath).arrayBuffer();

	// 解压 gzip
	const tarData = Bun.gunzipSync(Buffer.from(compressed));

	// 解析 tar
	let offset = 0;

	while (offset < tarData.length) {
		// 读取头部（512 字节）
		const header = tarData.subarray(offset, offset + 512);
		offset += 512;

		// 检查是否是空块（结束标志）
		if (header.every((b) => b === 0)) {
			// 检查下一个块是否也是空的
			if (offset + 512 <= tarData.length) {
				const nextHeader = tarData.subarray(offset, offset + 512);
				if (nextHeader.every((b) => b === 0)) {
					break;
				}
			}
			continue;
		}

		// 解析文件名（前 100 字节）
		const nameEnd = Buffer.from(header).indexOf(0, 0);
		const fileName = Buffer.from(
			header.subarray(0, nameEnd === -1 ? 100 : nameEnd),
		).toString("utf8");

		if (!fileName || fileName === "./" || fileName === "/") {
			continue;
		}

		// 解析文件大小（偏移 124，12 字节八进制）
		const sizeBuf = Buffer.from(header.subarray(124, 136));
		const sizeEnd = sizeBuf.indexOf(0);
		const sizeStr = sizeBuf
			.subarray(0, sizeEnd === -1 ? 12 : sizeEnd)
			.toString("utf8")
			.trim();
		const fileSize = parseInt(sizeStr, 8) || 0;

		// 解析文件模式（偏移 100，8 字节八进制）
		const modeBuf = Buffer.from(header.subarray(100, 108));
		const modeEnd = modeBuf.indexOf(0);
		const modeStr = modeBuf
			.subarray(0, modeEnd === -1 ? 8 : modeEnd)
			.toString("utf8")
			.trim();
		const fileMode = parseInt(modeStr, 8) || 0o644;

		// 解析类型标志（偏移 156）
		const typeFlag = String.fromCharCode(header[156] || 0x30);

		if (typeFlag === "5") {
			// 目录
			const dirPath = path.join(destDir, fileName);
			await fs.mkdir(dirPath, { recursive: true });
		} else if (typeFlag === "0" || typeFlag === "\x00") {
			// 普通文件
			const filePath = path.join(destDir, fileName);
			const fileData = tarData.subarray(offset, offset + fileSize);

			// 确保父目录存在
			await fs.mkdir(path.dirname(filePath), { recursive: true });

			// 写入文件
			await Bun.write(filePath, fileData);

			// 设置权限
			try {
				await fs.chmod(filePath, fileMode);
			} catch {
				// 忽略权限设置错误
			}
		}

		// 跳过文件内容（对齐到 512 字节）
		offset += fileSize;
		if (fileSize % 512 !== 0) {
			offset += 512 - (fileSize % 512);
		}
	}
}

async function setExecutablePermissions(dir: string) {
	async function walk(currentDir: string) {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);

			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.isFile()) {
				// 检查是否是可执行文件（根据文件名判断）
				const isExecutable =
					!entry.name.includes(".") || // 无扩展名（Unix 可执行文件）
					entry.name.endsWith(".exe") || // Windows 可执行文件
					entry.name === "pmd" || // 特定脚本
					entry.name === "pmd.bat" ||
					entry.name === "revive" ||
					entry.name === "biome" ||
					entry.name === "ruff" ||
					entry.name === "clang-tidy";

				if (isExecutable) {
					try {
						await fs.chmod(fullPath, 0o755);
					} catch {
						// 忽略权限设置错误
					}
				}
			}
		}
	}

	await walk(dir);
}

async function main() {
	// 检查 bundles 目录是否存在
	try {
		await fs.access(bundlesDir);
	} catch {
		console.log(
			"[extract-lint] ⚠️  Bundles directory not found, skipping extraction",
		);
		process.exit(0);
	}

	// 获取当前平台可用的所有压缩包
	const platformBundles = await getBundlesForPlatform();

	if (platformBundles.length === 0) {
		console.log(
			`[extract-lint] ⚠️  No bundles found for ${currentPlatform}-${currentArch}`,
		);

		try {
			const allBundles = await fs.readdir(bundlesDir);
			console.log("[extract-lint] Available bundles:");
			for (const b of allBundles.filter((f) => f.endsWith(".tar.gz"))) {
				console.log(`  - ${b}`);
			}
		} catch {
			// 忽略读取错误
		}

		process.exit(0);
	}

	console.log(
		`[extract-lint] Found ${platformBundles.length} bundle(s) for current platform`,
	);

	// 解压每个包
	for (const bundle of platformBundles) {
		await extractBundle(bundle);
	}

	console.log("[extract-lint] ✅ Extraction complete");
}

main().catch((err) => {
	console.error("[extract-lint] ❌ Error:", err);
	// postinstall 失败不应该中断安装，只打印警告
	console.log("[extract-lint] ⚠️  Lint tools may not be available");
	process.exit(0);
});
