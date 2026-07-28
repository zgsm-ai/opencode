import { describe, expect, it } from "bun:test"
import { createStore } from "solid-js/store"
import {
  binaryFilesUpdate,
  buildCapabilityPayloadFromFiles,
  fileContentsUpdate,
  isPathOrDescendant,
  removeFileContents,
  renameFileContents,
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
// would silently end up inside the submitted zip).
function createBinaryStore(binaryFiles: BinaryFileMap) {
  const [form, setForm] = createStore({ binaryFiles })
  return {
    form,
    replaceBinaryFiles: (next: BinaryFileMap) => setForm("binaryFiles", binaryFilesUpdate(next)),
  }
}

function makeFile(name: string, bytes = "binary-bytes") {
  return new File([bytes], name.split("/").pop() ?? name, { type: "application/octet-stream" })
}

const BINARY_FILES: BinaryFileMap = {
  "assets/probe.png": makeFile("assets/probe.png"),
  "assets/nested/logo.ico": makeFile("assets/nested/logo.ico"),
  "models/weights.bin": makeFile("models/weights.bin"),
}

describe("capability editor binary files", () => {
  it("drops a deleted directory's binary descendants from the store", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles(removeFileContents(form.binaryFiles, "assets"))

    expect(Object.keys(form.binaryFiles)).toEqual(["models/weights.bin"])
  })

  it("moves binary entries when their directory is renamed", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })
    const original = form.binaryFiles["assets/probe.png"]

    replaceBinaryFiles(renameFileContents(form.binaryFiles, "assets", "static"))

    expect(Object.keys(form.binaryFiles).sort()).toEqual([
      "models/weights.bin",
      "static/nested/logo.ico",
      "static/probe.png",
    ])
    expect(form.binaryFiles["static/probe.png"]).toBe(original as File)
  })

  it("does not keep stale binary entries when a new directory is uploaded", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles({ "assets/other.png": makeFile("assets/other.png") })

    expect(Object.keys(form.binaryFiles)).toEqual(["assets/other.png"])
  })

  it("empties the map on item-type switch", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({ ...BINARY_FILES })

    replaceBinaryFiles({})

    expect(Object.keys(form.binaryFiles)).toEqual([])
  })

  it("keeps File instances usable after passing through the store", () => {
    const { form, replaceBinaryFiles } = createBinaryStore({})

    replaceBinaryFiles({ "assets/probe.png": makeFile("assets/probe.png", "1234") })
    const stored = form.binaryFiles["assets/probe.png"]

    expect(stored).toBeInstanceOf(File)
    expect((stored as File).size).toBe(4)
    expect((stored as File).name).toBe("probe.png")
  })
})
