import { describe, expect, it } from "bun:test"
import { createStore } from "solid-js/store"
import {
  buildCapabilityPayloadFromFiles,
  fileContentsUpdate,
  isPathOrDescendant,
  removeFileContents,
  renameFileContents,
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
