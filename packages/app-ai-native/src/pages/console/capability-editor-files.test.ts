import { describe, expect, it } from "bun:test"
import { createStore } from "solid-js/store"
import {
  binaryFilesUpdate,
  buildCapabilityPayloadFromFiles,
  buildContentSnapshot,
  checkArchiveSizeLimits,
  fileContentsUpdate,
  isPathOrDescendant,
  isValidTreeEntryName,
  normalizeImportedPath,
  removeFileContents,
  renameFileContents,
  type BinaryFileEntry,
  type BinaryFileMap,
  type FileContentMap,
} from "./capability-editor-files"

// The editor keeps the file tree and the file-content map in the same Solid
// store. Writing a bare object into the map only shallow-merges it, so paths
// the user deleted survive and get submitted as assets. These tests pin the
// replacement semantics that fileContentsUpdate has to provide.
function createFormStore(fileContents: FileContentMap) {
  const [form, setForm] = createStore({ fileContents })
  return {
    form,
    replaceFileContents: (next: FileContentMap) => setForm("fileContents", fileContentsUpdate(next)),
    editFile: (path: string, content: string) => setForm("fileContents", path, content),
  }
}

const SKILL_FILES: FileContentMap = {
  "SKILL.md": "main",
  "LICENSE.txt": "license",
  "scripts/__init__.py": "init",
  "scripts/office/helpers/pptx_chart.py": "chart",
  "scripts/office/schemas/dml-main.xsd": "schema",
}

describe("capability editor file contents", () => {
  it("drops a deleted directory and all of its descendants from the store", () => {
    const { form, replaceFileContents } = createFormStore({ ...SKILL_FILES })

    replaceFileContents(removeFileContents(form.fileContents, "scripts/office"))

    expect(Object.keys(form.fileContents).sort()).toEqual([
      "LICENSE.txt",
      "SKILL.md",
      "scripts/__init__.py",
    ])
  })

  it("keeps deleted paths out of the submitted assets", () => {
    const { form, replaceFileContents } = createFormStore({ ...SKILL_FILES })

    replaceFileContents(removeFileContents(form.fileContents, "scripts/office"))
    const payload = buildCapabilityPayloadFromFiles("skill", "pptx", form.fileContents)

    expect(payload.assets.map((asset) => asset.relPath).sort()).toEqual([
      "LICENSE.txt",
      "scripts/__init__.py",
    ])
    expect(payload.content).toBe("main")
  })

  it("moves a renamed directory instead of duplicating it", () => {
    const { form, replaceFileContents } = createFormStore({ ...SKILL_FILES })

    replaceFileContents(renameFileContents(form.fileContents, "scripts/office", "scripts/libreoffice"))

    expect(Object.keys(form.fileContents)).toContain("scripts/libreoffice/schemas/dml-main.xsd")
    expect(Object.keys(form.fileContents)).not.toContain("scripts/office/schemas/dml-main.xsd")
  })

  it("does not carry files over when the item type changes", () => {
    const { form, replaceFileContents } = createFormStore({ ...SKILL_FILES })

    replaceFileContents({ ".mcp.json": "{}" })

    expect(Object.keys(form.fileContents)).toEqual([".mcp.json"])
  })

  it("does not carry stale files over when a new directory is uploaded", () => {
    const { form, replaceFileContents } = createFormStore({ ...SKILL_FILES })

    replaceFileContents({ "SKILL.md": "second upload", "docs/readme.md": "docs" })

    expect(Object.keys(form.fileContents).sort()).toEqual(["SKILL.md", "docs/readme.md"])
    expect(form.fileContents["SKILL.md"]).toBe("second upload")
  })

  it("still accepts single-key edits after the map was replaced", () => {
    const { form, replaceFileContents, editFile } = createFormStore({ "SKILL.md": "v1" })

    replaceFileContents({ "SKILL.md": "v1", "notes.md": "n" })
    editFile("notes.md", "edited in the editor")

    expect(form.fileContents["notes.md"]).toBe("edited in the editor")
    expect(form.fileContents["SKILL.md"]).toBe("v1")
  })

  it("empties the store when every path is removed", () => {
    const { form, replaceFileContents } = createFormStore({ ...SKILL_FILES })

    replaceFileContents({})

    expect(Object.keys(form.fileContents)).toEqual([])
  })

  it("leaves siblings that merely share a name prefix alone", () => {
    const contents: FileContentMap = {
      scripts: "a file literally named scripts",
      "scripts/b.py": "inside the directory",
      "scripts2/a.py": "different directory",
    }

    expect(Object.keys(removeFileContents(contents, "scripts"))).toEqual(["scripts2/a.py"])
    expect(isPathOrDescendant("scripts2/a.py", "scripts")).toBe(false)
    expect(isPathOrDescendant("scripts/b.py", "scripts")).toBe(true)
  })
})

// The binary-file map lives in the same Solid store as fileContents and must
// obey the same lifecycle: directory delete/rename touches binary descendants,
// re-upload and type switch replace the map outright (no stale entries that
// would silently end up inside the submitted zip). Remote entries (assets that
// already live in object storage) follow the same semantics.
function createBinaryStore(binaryFiles: BinaryFileMap) {
  const [form, setForm] = createStore({ binaryFiles })
  return {
    form,
    replaceBinaryFiles: (next: BinaryFileMap) => setForm("binaryFiles", binaryFilesUpdate(next)),
  }
}

function localEntry(name: string, bytes = "binary-bytes"): BinaryFileEntry {
  return { kind: "local", file: new File([bytes], name.split("/").pop() ?? name, { type: "application/octet-stream" }) }
}

function remoteEntry(sha = "abc123", fileSize = 463): BinaryFileEntry {
  return { kind: "remote", fileSize, mimeType: "image/png", contentSha: sha }
}

const BINARY_FILES: BinaryFileMap = {
  "assets/probe.png": remoteEntry(),
  "assets/nested/logo.ico": localEntry("assets/nested/logo.ico"),
  "models/weights.bin": localEntry("models/weights.bin"),
}

describe("capability editor binary files", () => {
  it("drops a deleted directory's binary descendants from the store", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles(removeFileContents(form.binaryFiles, "assets"))

    expect(Object.keys(form.binaryFiles)).toEqual(["models/weights.bin"])
  })

  it("drops a deleted remote entry without touching its siblings", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles(removeFileContents(form.binaryFiles, "assets/probe.png"))

    expect(Object.keys(form.binaryFiles).sort()).toEqual([
      "assets/nested/logo.ico",
      "models/weights.bin",
    ])
  })

  it("moves binary entries when their directory is renamed", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })
    const original = form.binaryFiles["assets/nested/logo.ico"]

    replaceBinaryFiles(renameFileContents(form.binaryFiles, "assets", "static"))

    expect(Object.keys(form.binaryFiles).sort()).toEqual([
      "models/weights.bin",
      "static/nested/logo.ico",
      "static/probe.png",
    ])
    expect(form.binaryFiles["static/nested/logo.ico"]).toBe(original as BinaryFileEntry)
  })

  it("replaces a remote entry when a re-imported directory carries the same path", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ "assets/probe.png": remoteEntry() })

    replaceBinaryFiles({ "assets/probe.png": localEntry("assets/probe.png", "new-bytes") })

    expect(form.binaryFiles["assets/probe.png"]?.kind).toBe("local")
  })

  it("does not keep stale binary entries when a new directory is uploaded", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles({ "assets/other.png": localEntry("assets/other.png") })

    expect(Object.keys(form.binaryFiles)).toEqual(["assets/other.png"])
  })

  it("empties the map on item-type switch", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles({})

    expect(Object.keys(form.binaryFiles)).toEqual([])
  })

  it("keeps File instances usable after passing through the store", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({})

    replaceBinaryFiles({ "assets/probe.png": localEntry("assets/probe.png", "1234") })
    const stored = form.binaryFiles["assets/probe.png"]

    expect(stored?.kind).toBe("local")
    const file = (stored as Extract<BinaryFileEntry, { kind: "local" }>).file
    expect(file).toBeInstanceOf(File)
    expect(file.size).toBe(4)
    expect(file.name).toBe("probe.png")
  })
})

// The edit-save no-op check compares snapshots of the FULL editor content
// state. Binary entries must be part of it: deleting a remote binary has to
// register as a change or the save is skipped and the deletion never happens.
describe("content snapshot", () => {
  const files: FileContentMap = { "SKILL.md": "main" }

  it("is stable for identical state", () => {
    expect(buildContentSnapshot(files, { "assets/probe.png": remoteEntry("sha1") }))
      .toBe(buildContentSnapshot({ ...files }, { "assets/probe.png": remoteEntry("sha1") }))
  })

  it("changes when a remote binary is removed", () => {
    const before = buildContentSnapshot(files, { "assets/probe.png": remoteEntry() })
    const after = buildContentSnapshot(files, {})
    expect(after).not.toBe(before)
  })

  it("changes when a remote binary is replaced by a local file", () => {
    const before = buildContentSnapshot(files, { "assets/probe.png": remoteEntry() })
    const after = buildContentSnapshot(files, { "assets/probe.png": localEntry("assets/probe.png") })
    expect(after).not.toBe(before)
  })

  it("is insensitive to binary map key order", () => {
    const a = buildContentSnapshot(files, { "b.bin": remoteEntry("s2"), "a.bin": remoteEntry("s1") })
    const b = buildContentSnapshot(files, { "a.bin": remoteEntry("s1"), "b.bin": remoteEntry("s2") })
    expect(a).toBe(b)
  })
})

// Paths that end up inside the uploaded zip must obey the server's
// normalizeArchivePath semantics; anything that could traverse out of the
// archive root is rejected outright.
describe("archive path validation", () => {
  it("passes plain relative paths through", () => {
    expect(normalizeImportedPath("s3-probe/assets/probe.png")).toBe("s3-probe/assets/probe.png")
  })

  it("normalizes backslashes and drops empty/dot segments", () => {
    expect(normalizeImportedPath("dir\\sub\\file.bin")).toBe("dir/sub/file.bin")
    expect(normalizeImportedPath("./dir//file.md")).toBe("dir/file.md")
  })

  it("rejects traversal and absolute paths", () => {
    expect(normalizeImportedPath("../escape.md")).toBeNull()
    expect(normalizeImportedPath("dir/../../escape.md")).toBeNull()
    expect(normalizeImportedPath("/etc/passwd")).toBeNull()
    expect(normalizeImportedPath("C:/windows/system32")).toBeNull()
    expect(normalizeImportedPath("")).toBeNull()
    expect(normalizeImportedPath(".")).toBeNull()
  })

  it("validates single tree entry names", () => {
    expect(isValidTreeEntryName("notes.md")).toBe(true)
    expect(isValidTreeEntryName("sub dir")).toBe(true)
    expect(isValidTreeEntryName("a/b")).toBe(false)
    expect(isValidTreeEntryName("a\\b")).toBe(false)
    expect(isValidTreeEntryName("..")).toBe(false)
    expect(isValidTreeEntryName(".")).toBe(false)
    expect(isValidTreeEntryName("  ")).toBe(false)
  })
})

// Submit-time size preflight over the final text+binary set (the user can
// paste huge text after import, so the import-time check alone is not enough).
describe("archive size limits", () => {
  it("accepts a set within the limits", () => {
    const check = checkArchiveSizeLimits({ "SKILL.md": "hello" }, { "a.bin": remoteEntry("s", 1024) })
    expect(check.ok).toBe(true)
    if (check.ok) expect(check.totalSize).toBe(5 + 1024)
  })

  it("rejects a single text file over 10MB and names it", () => {
    const check = checkArchiveSizeLimits({ "SKILL.md": "x", "big.txt": "y".repeat(10 * 1024 * 1024 + 1) }, {})
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.reason).toBe("file")
      if (check.reason === "file") expect(check.path).toBe("big.txt")
    }
  })

  it("rejects a single binary over 10MB", () => {
    const check = checkArchiveSizeLimits({}, { "model.bin": remoteEntry("s", 10 * 1024 * 1024 + 1) })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toBe("file")
  })

  it("rejects when the total exceeds 50MB even if each file is under 10MB", () => {
    const binaries: BinaryFileMap = {}
    for (let i = 0; i < 6; i += 1) {
      binaries[`chunk-${i}.bin`] = remoteEntry("s", 9 * 1024 * 1024)
    }
    const check = checkArchiveSizeLimits({}, binaries)
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.reason).toBe("total")
  })
})
