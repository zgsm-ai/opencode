import { useNavigate, useParams } from "@solidjs/router"
import { LanguageDescription, LanguageSupport, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { markdown } from "@codemirror/lang-markdown"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { Compartment, EditorSelection, EditorState } from "@codemirror/state"
import { EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, rectangularSelection } from "@codemirror/view"
import { Button } from "@/components/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useItemFilterOptions } from "@/context/item-filter-options"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/pages/store/hooks/use-auth"
import { Markdown } from "@opencode-ai/ui/markdown"
import "@/styles/vscode-markdown.css"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createMemo, createResource, For, onCleanup, onMount, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { TYPE_COLORS, TYPE_CONTENT_PLACEHOLDER, typeKey } from "@/pages/store/lib/constants"
import { itemApi, registryApi2, repoApi, type CapabilityItem, type CapabilityItemAsset, type Repository } from "@/pages/store/lib/api"
import { getInstallCommand } from "@/pages/store/components/item-detail-content"
import { TagInput } from "@/pages/console/components/tag-input"
import { ConfirmDialog } from "@/pages/store/components/confirm-dialog"

type ItemType = "skill" | "subagent" | "command" | "mcp"

type NamespaceOption = {
  value: string
  label: string
  description: string
  visibility: "public" | "private" | "repo"
}

type VirtualTreeNode = {
  id: string
  name: string
  kind: "directory" | "file"
  path: string
  iconPath?: string
  children?: VirtualTreeNode[]
}

type FileContentMap = Record<string, string>

type PendingTreeAction = {
  mode: "create-file" | "create-directory" | "rename"
  targetPath: string | null
  draft: string
}

type DirectoryInputAttributes = HTMLInputElement & {
  webkitdirectory?: boolean
  directory?: boolean
}

type ImportedDirectoryFiles = {
  tree: VirtualTreeNode[]
  contents: FileContentMap
  firstFile: string
  hasSkillFile: boolean
  rootName: string
  importedCount: number
  filteredCount: number
}

const TYPE_DROPDOWN_LABELS_ZH: Record<ItemType, string> = {
  skill: "技能（Skill）",
  subagent: "子智能体（Subagent）",
  command: "命令（Command）",
  mcp: "MCP 服务器（MCP Server）",
}

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".gitignore",
  ".editorconfig",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".sql",
  ".graphql",
  ".gql",
  ".vue",
  ".svelte",
  ".lock",
  ".log",
])

function getExtension(filePath: string) {
  const fileName = filePath.split("/").pop() || filePath
  const dotIndex = fileName.lastIndexOf(".")
  if (dotIndex <= 0) return ""
  return fileName.slice(dotIndex).toLowerCase()
}

function isLikelyTextMimeType(mimeType: string) {
  const value = mimeType.toLowerCase()
  if (!value) return false
  return value.startsWith("text/")
    || value === "application/json"
    || value === "application/ld+json"
    || value === "application/xml"
    || value === "application/x-yaml"
    || value === "application/yaml"
    || value === "application/toml"
    || value === "image/svg+xml"
    || value.endsWith("+json")
    || value.endsWith("+xml")
}

function isLikelyTextBytes(bytes: Uint8Array) {
  if (bytes.length === 0) return true

  const sample = bytes.subarray(0, Math.min(bytes.length, 8192))
  let suspicious = 0

  for (const byte of sample) {
    if (byte === 0) return false
    const isControl = byte < 32 && byte !== 9 && byte !== 10 && byte !== 13 && byte !== 12
    if (isControl) suspicious += 1
  }

  return suspicious / sample.length < 0.02
}

async function readTextFileIfSupported(file: File, relativePath: string) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const extension = getExtension(relativePath)
  const likelyText = TEXT_FILE_EXTENSIONS.has(extension)
    || isLikelyTextMimeType(file.type)
    || isLikelyTextBytes(bytes)

  if (!likelyText) return null

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true })
    return decoder.decode(bytes)
  } catch {
    try {
      return new TextDecoder().decode(bytes)
    } catch {
      return null
    }
  }
}

function createDefaultTree(itemType: ItemType, slug: string): VirtualTreeNode[] {
  if (itemType === "skill") {
    return [
      {
        id: "SKILL.md",
        name: "SKILL.md",
        kind: "file",
        path: "SKILL.md",
        iconPath: "SKILL.md",
      },
    ]
  }

  if (itemType === "mcp") {
    return [
      {
        id: ".mcp.json",
        name: ".mcp.json",
        kind: "file",
        path: ".mcp.json",
        iconPath: ".mcp.json",
      },
    ]
  }

  const root = slug || "untitled"
  const fileName = `${root}.md`
  const filePath = itemType === "subagent" || itemType === "command"
    ? fileName
    : `${root}/${fileName}`

  if (itemType === "subagent" || itemType === "command") {
    return [
      {
        id: filePath,
        name: fileName,
        kind: "file",
        path: filePath,
        iconPath: fileName,
      },
    ]
  }

  return [
    {
      id: root,
      name: root,
      kind: "directory",
      path: root,
      children: [
        {
          id: filePath,
          name: fileName,
          kind: "file",
          path: filePath,
          iconPath: fileName,
        },
      ],
    },
  ]
}

function createDefaultFileContents(itemType: ItemType, slug: string): FileContentMap {
  if (itemType === "skill") {
    return { "SKILL.md": TYPE_CONTENT_PLACEHOLDER.skill }
  }

  if (itemType === "mcp") {
    return { ".mcp.json": TYPE_CONTENT_PLACEHOLDER.mcp }
  }

  const root = slug || "untitled"
  const fileName = `${root}.md`
  const filePath = itemType === "subagent" || itemType === "command"
    ? fileName
    : `${root}/${fileName}`
  return { [filePath]: TYPE_CONTENT_PLACEHOLDER[itemType] ?? "" }
}

function defaultSourcePathForItemType(itemType: ItemType, slug: string) {
  if (itemType === "skill") return "SKILL.md"
  if (itemType === "mcp") return ".mcp.json"
  const root = slug || "untitled"
  if (itemType === "subagent" || itemType === "command") return `${root}.md`
  return `${root}/${root}.md`
}

function buildCapabilityPayloadFromFiles(itemType: ItemType, slug: string, fileContents: FileContentMap) {
  const sourcePath = defaultSourcePathForItemType(itemType, slug)
  const content = fileContents[sourcePath]
    ?? (itemType === "skill" ? fileContents["SKILL.md"] : undefined)
    ?? (itemType === "mcp" ? fileContents[".mcp.json"] : undefined)
    ?? fileContents[Object.keys(fileContents)[0] ?? ""]
    ?? ""

  const assets: CapabilityItemAsset[] = Object.entries(fileContents)
    .filter(([path]) => path && path !== sourcePath)
    .map(([relPath, textContent]) => ({ relPath, textContent }))

  return { sourcePath, content, assets }
}

function buildFileContentsFromItem(item: CapabilityItem, assets?: CapabilityItemAsset[]): FileContentMap {
  const itemType = (item.itemType as ItemType) || "skill"
  const sourcePath = item.sourcePath || defaultSourcePathForItemType(itemType, item.slug || "")
  const next: FileContentMap = {
    [sourcePath]: item.content || TYPE_CONTENT_PLACEHOLDER[itemType] || "",
  }

  for (const asset of assets ?? item.assets ?? []) {
    if (!asset.relPath || typeof asset.textContent !== "string") continue
    next[asset.relPath] = asset.textContent
  }

  return next
}

function buildFileContentsFromVersion(item: CapabilityItem, version: { content?: string | null; sourcePath?: string; assets?: CapabilityItemAsset[] }): FileContentMap {
  const itemType = (item.itemType as ItemType) || "skill"
  const sourcePath = version.sourcePath || item.sourcePath || defaultSourcePathForItemType(itemType, item.slug || "")
  const next: FileContentMap = {
    [sourcePath]: (version.content ?? item.content ?? TYPE_CONTENT_PLACEHOLDER[itemType]) || "",
  }

  for (const asset of version.assets ?? []) {
    if (!asset.relPath || typeof asset.textContent !== "string") continue
    next[asset.relPath] = asset.textContent
  }

  return next
}

function formatVersionCreatedAt(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function renameTreeNode(nodes: VirtualTreeNode[], path: string, nextName: string): VirtualTreeNode[] {
  const visit = (items: VirtualTreeNode[]): VirtualTreeNode[] =>
    items.map((node) => {
      if (node.path === path) {
        const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
        const nextPath = parentPath ? `${parentPath}/${nextName}` : nextName
        return {
          ...node,
          id: nextPath,
          name: nextName,
          path: nextPath,
          iconPath: node.kind === "file" ? nextName : node.iconPath,
          children: node.children ? remapChildPaths(node.children, path, nextPath) : node.children,
        }
      }
      return {
        ...node,
        children: node.children ? visit(node.children) : node.children,
      }
    })

  const remapChildPaths = (items: VirtualTreeNode[], from: string, to: string): VirtualTreeNode[] =>
    items.map((node) => {
      const nextPath = node.path.replace(from, to)
      return {
        ...node,
        id: nextPath,
        path: nextPath,
        children: node.children ? remapChildPaths(node.children, from, to) : node.children,
      }
    })

  return visit(nodes)
}

function renameFileContents(contents: FileContentMap, from: string, to: string) {
  const next: FileContentMap = {}
  for (const [path, value] of Object.entries(contents)) {
    if (path === from || path.startsWith(`${from}/`)) {
      next[path.replace(from, to)] = value
    } else {
      next[path] = value
    }
  }
  return next
}

function removeTreeNode(nodes: VirtualTreeNode[], path: string): VirtualTreeNode[] {
  return nodes
    .filter((node) => node.path !== path)
    .map((node) => ({
      ...node,
      children: node.children ? removeTreeNode(node.children, path) : node.children,
    }))
}

function removeFileContents(contents: FileContentMap, path: string) {
  const next: FileContentMap = {}
  for (const [key, value] of Object.entries(contents)) {
    if (key === path || key.startsWith(`${path}/`)) continue
    next[key] = value
  }
  return next
}

function appendTreeNode(nodes: VirtualTreeNode[], targetPath: string | null, nextNode: VirtualTreeNode): VirtualTreeNode[] {
  if (!targetPath) return [...nodes, nextNode]

  return nodes.map((node) => {
    if (node.path === targetPath && node.kind === "directory") {
      return {
        ...node,
        children: [...(node.children ?? []), nextNode],
      }
    }
    return {
      ...node,
      children: node.children ? appendTreeNode(node.children, targetPath, nextNode) : node.children,
    }
  })
}

function treePathExists(nodes: VirtualTreeNode[], path: string): boolean {
  for (const node of nodes) {
    if (node.path === path) return true
    if (node.children?.length && treePathExists(node.children, path)) return true
  }
  return false
}

function dedupeTreeNodes(nodes: VirtualTreeNode[]): VirtualTreeNode[] {
  const seen = new Set<string>()

  const sortNodes = (items: VirtualTreeNode[]) =>
    [...items].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    })

  const visit = (items: VirtualTreeNode[]): VirtualTreeNode[] => {
    const result: VirtualTreeNode[] = []
    for (const node of sortNodes(items)) {
      if (seen.has(node.path)) continue
      seen.add(node.path)
      result.push({
        ...node,
        children: node.children ? visit(node.children) : node.children,
      })
    }
    return result
  }

  return visit(nodes)
}

function isDirectoryPath(nodes: VirtualTreeNode[], path: string | null): boolean {
  if (path === null) return true
  for (const node of nodes) {
    if (node.path === path) return node.kind === "directory"
    if (node.children?.length && isDirectoryPath(node.children, path)) return true
  }
  return false
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "")
}

function formatImportedTitle(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function extractImportedSkillDescription(contents: FileContentMap) {
  const skillPath = Object.keys(contents).find((path) => path.split("/").length === 1 && path.toUpperCase() === "SKILL.MD")
  if (!skillPath) return ""

  const content = contents[skillPath] ?? ""
  const frontmatterMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (!frontmatterMatch) return ""

  const frontmatter = frontmatterMatch[1]
  const descriptionLine = frontmatter
    .split(/\r?\n/)
    .find((line) => /^description\s*:/i.test(line.trim()))
  if (!descriptionLine) return ""

  const value = descriptionLine.replace(/^description\s*:\s*/i, "").trim()
  if (!value) return ""

  const quoted = value.match(/^(['"])([\s\S]*)\1$/)
  return quoted ? quoted[2].trim() : value
}

function resetCapabilityDraft(setForm: (setter: unknown, ...args: unknown[]) => void, itemType: ItemType) {
  setForm({
    itemType,
    namespace: "public",
    name: "",
    slug: "",
    slugManual: false,
    description: "",
    category: "utilities",
    tags: [],
    content: TYPE_CONTENT_PLACEHOLDER[itemType] ?? "",
    saving: false,
    importing: false,
    error: "",
    loaded: false,
    cursorLine: 1,
    cursorColumn: 1,
    previewScrollRatio: 0,
    selectedTreePath: defaultSourcePathForItemType(itemType, "") || Object.keys(createDefaultFileContents(itemType, ""))[0] || "",
    treeExpanded: {},
    treeNodes: createDefaultTree(itemType, ""),
    fileContents: createDefaultFileContents(itemType, ""),
    pendingTreeAction: null,
    pendingTreeActionLocked: false,
    installCommandCopied: false,
    selectedRevision: 0,
  })
}

function extractMarkdownTree(content: string) {
  const headings = content
    .split(/\r?\n/)
    .map((line) => /^(#{1,6})\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match, index) => ({
      id: `${index}-${match[2]}`,
      depth: match[1].length,
      label: match[2].trim(),
    }))

  return headings
}

function isMarkdownPath(path: string) {
  const value = path.toLowerCase()
  return value.endsWith(".md") || value.endsWith(".markdown") || value.endsWith(".mdx")
}

function languageExtensionForPath(path: string) {
  if (!path) return markdown()

  const match = LanguageDescription.matchFilename(languages, path)
  if (!match) return markdown()

  return match.support ?? markdown()
}

async function loadLanguageExtensionForPath(path: string) {
  if (!path) return markdown()

  const match = LanguageDescription.matchFilename(languages, path)
  if (!match) return markdown()

  if (match.support instanceof LanguageSupport) return match.support

  try {
    const loaded = await match.load()
    return loaded instanceof LanguageSupport ? loaded : markdown()
  } catch {
    return markdown()
  }
}

function languageLabelForPath(path: string) {
  if (!path) return "Markdown"
  const match = LanguageDescription.matchFilename(languages, path)
  return match?.name ?? (isMarkdownPath(path) ? "Markdown" : "Plain Text")
}

const PRELOAD_LANGUAGE_PATHS = [
  "SKILL.md",
  "example.js",
  "example.ts",
  "example.py",
  "example.sh",
  "example.json",
  "example.yaml",
  "example.yml",
] as const

let languagePreloadPromise: Promise<void> | undefined

function preloadCommonLanguages() {
  if (languagePreloadPromise) return languagePreloadPromise

  languagePreloadPromise = Promise.all(
    PRELOAD_LANGUAGE_PATHS.map(async (path) => {
      await loadLanguageExtensionForPath(path)
    }),
  ).then(() => undefined)

  return languagePreloadPromise
}

function buildTreeFromPaths(paths: string[]): VirtualTreeNode[] {
  const root: VirtualTreeNode[] = []

  for (const fullPath of paths) {
    const parts = fullPath.split("/").filter(Boolean)
    let currentLevel = root
    let currentPath = ""

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = i === parts.length - 1
      let existing = currentLevel.find((node) => node.path === currentPath)

      if (!existing) {
        existing = {
          id: currentPath,
          name: part,
          kind: isLast ? "file" : "directory",
          path: currentPath,
          iconPath: isLast ? part : undefined,
          children: isLast ? undefined : [],
        }
        currentLevel.push(existing)
      }

      if (existing.kind === "directory") {
        existing.children ??= []
        currentLevel = existing.children
      }
    }
  }

  return root
}

async function readDirectoryFiles(files: FileList | File[]): Promise<ImportedDirectoryFiles> {
  const entries = Array.from(files)
  const BATCH_SIZE = 24
  const textContents: FileContentMap = {}
  const rawPaths: string[] = []
  let filteredCount = 0

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(async (file) => {
      const relativePath = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/^\/+/, "")
      if (!relativePath) return null

      try {
        const content = await readTextFileIfSupported(file, relativePath)
        if (content === null) return { relativePath, filtered: true as const }
        return { relativePath, content, filtered: false as const }
      } catch {
        return { relativePath, filtered: true as const }
      }
    }))

    for (const result of results) {
      if (!result) continue
      if (result.filtered) {
        filteredCount += 1
        continue
      }
      rawPaths.push(result.relativePath)
      textContents[result.relativePath] = result.content
    }

    if (i + BATCH_SIZE < entries.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  const rootName = rawPaths[0]?.split("/")[0] ?? ""
  const paths = rawPaths.map((path) => path.startsWith(`${rootName}/`) ? path.slice(rootName.length + 1) : path).filter(Boolean)
  const normalizedContents: FileContentMap = {}

  for (const [path, value] of Object.entries(textContents)) {
    const normalizedPath = path.startsWith(`${rootName}/`) ? path.slice(rootName.length + 1) : path
    if (!normalizedPath) continue
    normalizedContents[normalizedPath] = value
  }

  return {
    tree: buildTreeFromPaths(paths),
    contents: normalizedContents,
    firstFile: paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))[0] ?? "",
    hasSkillFile: paths.some((path) => path.split("/").pop()?.toUpperCase() === "SKILL.MD"),
    rootName,
    importedCount: paths.length,
    filteredCount,
  }
}

function InlineTreeInput(props: {
  value: string
  mode: PendingTreeAction["mode"]
  isDirectory?: boolean
  onInput: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  let inputRef: HTMLInputElement | undefined

  const applySelection = () => {
    const input = inputRef
    if (!input) return
    input.focus()

    const draft = props.value
    const shouldSelectBaseName = props.mode === "create-file" || (props.mode === "rename" && !props.isDirectory && draft.includes("."))
    if (shouldSelectBaseName) {
      const lastDot = draft.lastIndexOf(".")
      if (lastDot > 0) {
        input.setSelectionRange(0, lastDot)
        return
      }
    }

    input.select()
  }

  onMount(() => {
    queueMicrotask(applySelection)
    requestAnimationFrame(applySelection)
    setTimeout(() => {
      applySelection()
    }, 50)
  })

  return (
    <input
      ref={inputRef}
      value={props.value}
      onInput={(e) => props.onInput(e.currentTarget.value)}
      onFocus={applySelection}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          e.stopPropagation()
          props.onSubmit()
        }
        if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          props.onCancel()
        }
      }}
      onBlur={props.onSubmit}
      class="h-7 min-w-0 flex-1 rounded-[4px] border border-[color:color-mix(in_srgb,var(--native-border)_30%,transparent)] bg-background-base px-2 text-[12px] text-[var(--native-foreground)] outline-none"
    />
  )
}

function WorkspaceLikeTree(props: {
  nodes: VirtualTreeNode[]
  selectedPath: string
  expanded: Record<string, boolean>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateDirectory: (path: string) => void
  canToggle?: (path: string) => boolean
  canRename?: (path: string) => boolean
  canDelete?: (path: string) => boolean
  pendingAction: PendingTreeAction | null
  onPendingDraftChange: (value: string) => void
  onPendingSubmit: () => void
  onPendingCancel: () => void
  readOnly?: boolean
  level?: number
}) {
  const level = () => props.level ?? 0
  const visibleNodes = () => dedupeTreeNodes(props.nodes)

  return (
    <div class="min-w-0">
      <For each={visibleNodes()}>
        {(node) => {
          const isDirectory = () => node.kind === "directory"
          const isExpanded = () => props.expanded[node.path] ?? true
          const isSelected = () => props.selectedPath === node.path
          const allowToggle = () => props.canToggle ? props.canToggle(node.path) : true
          const allowRename = () => props.canRename ? props.canRename(node.path) : true
          const allowDelete = () => props.canDelete ? props.canDelete(node.path) : true
          const showChevron = () => isDirectory() && allowToggle()
          const folderColor = () => !showChevron() ? "#fca5a5" : "var(--native-muted)"
          const rowPaddingLeft = () => `${8 + level() * 12}px`
          const isRenaming = () => props.pendingAction?.mode === "rename" && props.pendingAction?.targetPath === node.path

          const showPendingChild = () => {
            const pending = props.pendingAction
            if (!pending) return false
            return isDirectory() && (pending.mode === "create-file" || pending.mode === "create-directory") && pending.targetPath === node.path
          }

          return (
            <div>
              <Show
                when={!isRenaming()}
                fallback={
                  <div class="flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5" style={{ "padding-left": rowPaddingLeft() }}>
                    <Show
                      when={isDirectory()}
                      fallback={<span class="flex w-4 shrink-0 items-center justify-center"><FileIcon node={{ path: node.iconPath ?? node.path, type: "file" }} class="size-4" /></span>}
                    >
                      <Show when={showChevron()}>
                        <span class="flex w-4 shrink-0 items-center justify-center text-[var(--native-muted)]">
                          <Icon name={isExpanded() ? "chevron-down" : "chevron-right"} size="small" />
                        </span>
                      </Show>
                      <Icon name="folder" size="small" class="shrink-0" style={{ color: folderColor() }} />
                    </Show>
                    <InlineTreeInput
                      value={props.pendingAction?.draft ?? ""}
                      mode={props.pendingAction?.mode ?? "rename"}
                      isDirectory={isDirectory()}
                      onInput={props.onPendingDraftChange}
                      onSubmit={props.onPendingSubmit}
                      onCancel={props.onPendingCancel}
                    />
                  </div>
                }
              >
                <div
                  data-tree-path={node.path}
                  classList={{
                    "group/filetree flex h-8 min-w-0 items-center gap-1.5 px-1.5 text-left text-[12px] transition-colors duration-150": true,
                    "cursor-pointer": true,
                    "hover:bg-[var(--native-hover)]": !props.readOnly,
                    "bg-[color:color-mix(in_srgb,var(--native-foreground)_8%,transparent)]": isSelected(),
                  }}
                  style={{ "padding-left": rowPaddingLeft() }}
                  onClick={() => {
                    if (isDirectory()) {
                      if (allowToggle()) props.onToggle(node.path)
                      return
                    }
                    props.onSelect(node.path)
                  }}
                >
                  <Show
                    when={isDirectory()}
                    fallback={<span class="flex w-4 shrink-0 items-center justify-center"><FileIcon node={{ path: node.iconPath ?? node.path, type: "file" }} class="size-4" /></span>}
                  >
                    <Show when={showChevron()}>
                      <span class="flex w-4 shrink-0 items-center justify-center text-[var(--native-muted)]">
                        <Icon name={isExpanded() ? "chevron-down" : "chevron-right"} size="small" />
                      </span>
                    </Show>
                    <Icon name="folder" size="small" class="shrink-0" style={{ color: folderColor() }} />
                  </Show>

                  <span
                    classList={{
                      "min-w-0 flex-1 truncate": true,
                      "text-[var(--native-foreground)]": isSelected(),
                      "text-[var(--native-muted)]": !isSelected(),
                    }}
                  >
                    {node.name}
                  </span>

                <Show when={!props.readOnly && (isDirectory() || allowRename() || allowDelete())}>
                  <div class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/filetree:opacity-100">
                      <Show when={isDirectory()}>
                        <IconButton
                          icon="plus-small"
                          variant="ghost"
                          iconSize="small"
                          class="size-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            props.onCreateFile(node.path)
                          }}
                          aria-label="New file"
                        />
                        <IconButton
                          icon="folder-add-left"
                          variant="ghost"
                          iconSize="small"
                          class="size-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            props.onCreateDirectory(node.path)
                          }}
                          aria-label="New directory"
                        />
                      </Show>
                      <Show when={allowRename()}>
                        <IconButton
                          icon="edit"
                          variant="ghost"
                          iconSize="small"
                          class="size-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            props.onRename(node.path)
                          }}
                          aria-label="Rename"
                        />
                      </Show>
                      <Show when={allowDelete()}>
                        <IconButton
                          icon="trash"
                          variant="ghost"
                          iconSize="small"
                          class="size-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            props.onDelete(node.path)
                          }}
                          aria-label="Delete"
                        />
                      </Show>
                    </div>
                  </Show>
                </div>
              </Show>

              <Show when={isDirectory() && isExpanded() && node.children?.length}>
                <WorkspaceLikeTree
                  nodes={node.children ?? []}
                  selectedPath={props.selectedPath}
                  expanded={props.expanded}
                  onToggle={props.onToggle}
                  onSelect={props.onSelect}
                  onRename={props.onRename}
                  onDelete={props.onDelete}
                  onCreateFile={props.onCreateFile}
                  onCreateDirectory={props.onCreateDirectory}
                  canToggle={props.canToggle}
                  canRename={props.canRename}
                  canDelete={props.canDelete}
                  pendingAction={props.pendingAction}
                  onPendingDraftChange={props.onPendingDraftChange}
                  onPendingSubmit={props.onPendingSubmit}
                  onPendingCancel={props.onPendingCancel}
                  readOnly={props.readOnly}
                  level={level() + 1}
                />
              </Show>

              <Show when={isDirectory() && isExpanded() && showPendingChild()}>
                <div class="flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5" style={{ "padding-left": `${8 + (level() + 1) * 12}px` }}>
                  <span class="flex w-4 shrink-0 items-center justify-center">
                    <Show
                      when={props.pendingAction?.mode === "create-directory"}
                      fallback={<FileIcon node={{ path: props.pendingAction?.draft || "new-file.md", type: "file" }} class="size-4" />}
                    >
                      <Icon name="folder" size="small" class="shrink-0 text-[var(--native-muted)]" />
                    </Show>
                  </span>
                  <InlineTreeInput
                    value={props.pendingAction?.draft ?? ""}
                    mode={props.pendingAction?.mode ?? "create-file"}
                    isDirectory={props.pendingAction?.mode === "create-directory"}
                    onInput={props.onPendingDraftChange}
                    onSubmit={props.onPendingSubmit}
                    onCancel={props.onPendingCancel}
                  />
                </div>
              </Show>
            </div>
          )
        }}
      </For>

      <Show when={level() === 0 && props.pendingAction && props.pendingAction.targetPath === null}>
        <div class="flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5">
          <span class="flex w-4 shrink-0 items-center justify-center">
            <Show
              when={props.pendingAction?.mode === "create-directory"}
              fallback={<FileIcon node={{ path: props.pendingAction?.draft || "new-file.md", type: "file" }} class="size-4" />}
            >
              <Icon name="folder" size="small" class="shrink-0 text-[var(--native-muted)]" />
            </Show>
          </span>
          <InlineTreeInput
            value={props.pendingAction?.draft ?? ""}
            mode={props.pendingAction?.mode ?? "create-file"}
            isDirectory={props.pendingAction?.mode === "create-directory"}
            onInput={props.onPendingDraftChange}
            onSubmit={props.onPendingSubmit}
            onCancel={props.onPendingCancel}
          />
        </div>
      </Show>
    </div>
  )
}

function MarkdownCodeEditor(props: {
  value: string
  path: string
  editable?: boolean
  onCursorChange?: (payload: { line: number; column: number }) => void
  onScrollRatioChange?: (ratio: number) => void
  onChange: (value: string) => void
}) {
  let root!: HTMLDivElement
  let view: EditorView | undefined
  const listenerCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const languageCompartment = new Compartment()
  const editableCompartment = new Compartment()
  const readOnlyCompartment = new Compartment()

  const theme = () =>
    EditorView.theme({
      "&": {
        height: "100%",
        "font-size": "14px",
        "background-color": "var(--native-bg-subtle)",
        color: "var(--native-foreground)",
        outline: "none",
      },
      "&:focus, &:focus-visible, &:focus-within": {
        outline: "none !important",
        boxShadow: "none !important",
      },
      ".cm-scroller": {
        "font-family": "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
        "line-height": "1.65",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "16px",
        "min-height": "100%",
        caretColor: "var(--native-foreground)",
      },
      ".cm-gutters": {
        background: "color-mix(in srgb, var(--native-panel) 88%, var(--native-bg-subtle))",
        color: "var(--native-muted)",
        border: "none",
        "border-right": "1px solid color-mix(in srgb, var(--native-border) 18%, transparent)",
      },
      ".cm-activeLine": {
        background: "color-mix(in srgb, var(--native-foreground) 3%, transparent)",
      },
      ".cm-activeLineGutter": {
        background: "color-mix(in srgb, var(--native-foreground) 4%, transparent)",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        background: "color-mix(in srgb, var(--native-primary) 24%, transparent) !important",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--native-foreground)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 10px 0 12px",
      },
      ".cm-focused": {
        outline: "none",
      },
      "&.cm-focused": {
        outline: "none !important",
        boxShadow: "none !important",
      },
      ".cm-scroller:focus, .cm-scroller:focus-visible, .cm-content:focus, .cm-content:focus-visible, .cm-lineNumbers:focus": {
        outline: "none !important",
        boxShadow: "none !important",
      },
    })

  const emitCursor = (state: EditorState) => {
    const head = state.selection.main.head
    const line = state.doc.lineAt(head)
    props.onCursorChange?.({ line: line.number, column: head - line.from + 1 })
  }

  const emitScrollRatio = (currentView: EditorView) => {
    const scroller = currentView.scrollDOM
    const max = scroller.scrollHeight - scroller.clientHeight
    props.onScrollRatioChange?.(max > 0 ? scroller.scrollTop / max : 0)
  }

  onMount(() => {
    void preloadCommonLanguages()
    view = new EditorView({
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          highlightActiveLine(),
          languageCompartment.of(languageExtensionForPath(props.path)),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          editableCompartment.of(EditorView.editable.of(props.editable ?? true)),
          readOnlyCompartment.of(EditorState.readOnly.of(!(props.editable ?? true))),
          listenerCompartment.of(EditorView.updateListener.of((update) => {
            if (update.docChanged) props.onChange(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) emitCursor(update.state)
            if (update.viewportChanged || update.geometryChanged || update.docChanged) emitScrollRatio(update.view)
          })),
          themeCompartment.of(theme()),
        ],
      }),
      parent: root,
    })

    emitCursor(view.state)
    emitScrollRatio(view)
    void loadLanguageExtensionForPath(props.path).then((extension) => {
      if (!view) return
      view.dispatch({ effects: languageCompartment.reconfigure(extension) })
    })
  })

  createEffect(() => {
    const next = props.value
    if (!view) return
    const current = view.state.doc.toString()
    if (current === next) return
    const nextLength = next.length
    const main = view.state.selection.main
    const anchor = Math.max(0, Math.min(main.anchor, nextLength))
    const head = Math.max(0, Math.min(main.head, nextLength))
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next },
      selection: EditorSelection.single(anchor, head),
    })
    emitCursor(view.state)
    emitScrollRatio(view)
  })

  createEffect(() => {
    if (!view) return
    const path = props.path
    view.dispatch({
      effects: [
        languageCompartment.reconfigure(languageExtensionForPath(path)),
        themeCompartment.reconfigure(theme()),
        editableCompartment.reconfigure(EditorView.editable.of(props.editable ?? true)),
        readOnlyCompartment.reconfigure(EditorState.readOnly.of(!(props.editable ?? true))),
        listenerCompartment.reconfigure(EditorView.updateListener.of((update) => {
          if (update.docChanged) props.onChange(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) emitCursor(update.state)
          if (update.viewportChanged || update.geometryChanged || update.docChanged) emitScrollRatio(update.view)
        })),
      ],
    })

    void loadLanguageExtensionForPath(path).then((extension) => {
      if (!view) return
      view.dispatch({ effects: languageCompartment.reconfigure(extension) })
    })
  })

  onCleanup(() => view?.destroy())

  return <div ref={root} class="min-h-0 flex-1" />
}

export default function CapabilityEditorPage() {
  const language = useLanguage()
  const itemFilterOptions = useItemFilterOptions()
  const dialog = useDialog()
  const navigate = useNavigate()
  const params = useParams<{ itemId?: string }>()
  const auth = useAuth()

  const isEdit = createMemo(() => Boolean(params.itemId))

  const [layout, setLayout] = createStore({
    sidebarWidth: 300,
    sidebarCollapsed: false,
  })

  let previewScrollEl: HTMLDivElement | undefined
  let treeScrollEl: HTMLDivElement | undefined
  let directoryInputEl: DirectoryInputAttributes | undefined

  onMount(() => {
    if (directoryInputEl) {
      directoryInputEl.webkitdirectory = true
      directoryInputEl.directory = true
    }
  })

  const [form, setForm] = createStore({
    itemType: "skill" as ItemType,
    namespace: "public",
    name: "",
    slug: "",
    slugManual: false,
    description: "",
    category: "utilities",
    tags: [] as string[],
    content: TYPE_CONTENT_PLACEHOLDER.skill,
    saving: false,
    importing: false,
    error: "",
    loaded: false,
    cursorLine: 1,
    cursorColumn: 1,
    previewScrollRatio: 0,
    selectedTreePath: "",
    treeExpanded: {} as Record<string, boolean>,
    treeNodes: createDefaultTree("skill", "") as VirtualTreeNode[],
    fileContents: createDefaultFileContents("skill", "") as FileContentMap,
    pendingTreeAction: null as PendingTreeAction | null,
    pendingTreeActionLocked: false,
    installCommandCopied: false,
    selectedRevision: 0,
  })

  const [item, { mutate: mutateItem }] = createResource(
    () => params.itemId,
    async (itemId) => {
      if (!itemId) return null
      return itemApi.get(itemId)
    },
  )

  const [versions, { mutate: mutateVersions }] = createResource(
    () => params.itemId,
    async (itemId) => {
      if (!itemId) return []
      return itemApi.listVersions(itemId)
    },
  )

  const [itemAssets, { mutate: mutateItemAssets }] = createResource(
	() => params.itemId,
	async (itemId) => {
	  if (!itemId) return [] as CapabilityItemAsset[]
	  return itemApi.getAssets(itemId)
	},
  )

  const [selectedVersion] = createResource(
    () => {
      if (!isEdit() || !params.itemId || form.selectedRevision <= 0) return null
      const currentRevision = currentItem()?.currentRevision ?? 0
      if (currentRevision > 0 && form.selectedRevision === currentRevision) return null
      const revisions = new Set((versions() ?? []).map((version) => version.revision).filter((revision): revision is number => typeof revision === "number"))
      if (!revisions.has(form.selectedRevision)) return null
      return { itemId: params.itemId!, revision: form.selectedRevision }
    },
    async (args) => {
      if (!args) return null
      return itemApi.getVersion(args.itemId, args.revision)
    },
  )

  const [repositories] = createResource(
    () => auth.user()?.id ?? auth.user()?.subjectId ?? auth.user()?.sub ?? "",
    async (userId) => {
      if (!userId) return [] as Repository[]
      const result = await repoApi.listMy()
      return result.repositories ?? []
    },
  )

  const typeLabel = createMemo(() => language.t(typeKey(form.itemType)))
  const typeDropdownLabel = (type: ItemType) => language.locale() === "zh" ? TYPE_DROPDOWN_LABELS_ZH[type] : language.t(typeKey(type))
  const accent = createMemo(() => TYPE_COLORS[form.itemType] ?? TYPE_COLORS.skill)

  const namespaceOptions = createMemo<NamespaceOption[]>(() => {
    const options: NamespaceOption[] = [
      {
        value: "public",
        label: "public",
        description: language.t("store.capabilityDialog.namespace.publicDescription"),
        visibility: "public",
      },
    ]

    for (const repo of repositories() ?? []) {
      options.push({
        value: `repo:${repo.id}`,
        label: `@${repo.displayName || repo.name}`,
        description: language.t("store.capabilityDialog.namespace.repositoryDescription"),
        visibility: "repo",
      })
    }

    return options
  })

  const selectedNamespace = createMemo(
    () => namespaceOptions().find((option) => option.value === form.namespace) ?? namespaceOptions()[0],
  )

  const categoryOptions = createMemo(() => {
    const options = itemFilterOptions.categories().map((category) => category.slug)
    if (!form.category || options.includes(form.category)) return options
    return [...options, form.category]
  })

  createEffect(() => {
    const options = itemFilterOptions.categories()
    if (!options.length) return
    if (options.some((category) => category.slug === form.category)) return
    setForm("category", options[0]!.slug)
  })

  const currentItem = createMemo<CapabilityItem | null>(() => item() ?? null)
  const versionOptions = createMemo(() =>
    [...(versions() ?? [])].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (timeA !== timeB) return timeB - timeA
      return (b.revision ?? 0) - (a.revision ?? 0)
    }),
  )
  const availableRevisionSet = createMemo(() => new Set(versionOptions().map((version) => version.revision).filter((revision): revision is number => typeof revision === "number")))
  const isViewingHistoricalVersion = createMemo(() => {
    const currentRevision = currentItem()?.currentRevision ?? 0
    return Boolean(isEdit() && form.selectedRevision > 0 && currentRevision > 0 && form.selectedRevision !== currentRevision)
  })
  const fixedSkillRoot = createMemo(() => form.slug || "skill")
  const skillDisplayRootPath = createMemo(() => `__skill_root__/${fixedSkillRoot()}`)

  const packageIdentifier = createMemo(() => {
    const ns = isEdit()
      ? currentItem()?.repoName
        ? `@${currentItem()?.repoName}`
        : "public"
      : (selectedNamespace()?.label ?? "public")

    return `${ns}/${form.slug || `my-${form.itemType}`}`
  })

  const installCommand = createMemo(() => getInstallCommand({
    itemType: form.itemType,
    slug: form.slug || `my-${form.itemType}`,
    registry: { name: selectedNamespace()?.label?.replace(/^@/, "") || "public" },
  } as CapabilityItem))

  const fileTree = createMemo(() => {
    const selectedFile = form.selectedTreePath || Object.keys(form.fileContents)[0] || ""
    const filename = selectedFile.split("/").pop() || ""
    return {
      root: selectedFile.includes("/") ? selectedFile.slice(0, selectedFile.lastIndexOf("/")) : "",
      filename,
      headings: extractMarkdownTree(form.fileContents[selectedFile] ?? ""),
    }
  })

  const selectedFileContent = createMemo(() => form.fileContents[form.selectedTreePath] ?? "")
  const activeFilePath = createMemo(() => form.selectedTreePath || Object.keys(form.fileContents)[0] || "")
  const showPreview = createMemo(() => isMarkdownPath(activeFilePath()))
  const currentLanguageLabel = createMemo(() => languageLabelForPath(activeFilePath()))

  createEffect(() => {
    if (!form.selectedTreePath && form.treeNodes.length > 0) {
      const firstNode = form.treeNodes[0]!
      const firstPath = firstNode.kind === "directory" ? firstNode.children?.[0]?.path ?? firstNode.path : firstNode.path
      setForm("selectedTreePath", firstPath)
    }
  })

  createEffect(() => {
    if (form.itemType !== "skill") return
    setForm("treeExpanded", skillDisplayRootPath(), true)
  })

  createEffect(() => {
    const selectedPath = form.selectedTreePath
    const container = treeScrollEl
    if (!selectedPath || !container) return

    queueMicrotask(() => {
      const target = container.querySelector(`[data-tree-path="${selectedPath.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"]`) as HTMLElement | null
      target?.scrollIntoView({ block: "nearest" })
    })
  })

  const currentFilePath = createMemo(() => fileTree().root ? `${fileTree().root}/${fileTree().filename}` : fileTree().filename)
  const statusBarFilePath = createMemo(() => {
    if (form.itemType === "mcp") return ".mcp.json"
    if (form.itemType === "subagent" || form.itemType === "command") {
      return defaultSourcePathForItemType(form.itemType, form.slug || "")
    }
    return currentFilePath()
  })

  createEffect(() => {
    const data = currentItem()
    if (!isEdit() || !data || form.loaded) return

    const itemType = (data.itemType as ItemType) || "skill"
    if (itemAssets.loading) return
    const fileContents = buildFileContentsFromItem(data, itemAssets() ?? [])
    const filePaths = Object.keys(fileContents)
    const selectedTreePath = data.sourcePath || defaultSourcePathForItemType(itemType, data.slug || "") || filePaths[0] || ""

    setForm({
      itemType,
      name: data.name || "",
      slug: data.slug || "",
      slugManual: true,
      description: data.description || "",
      category: data.category || "utilities",
      tags: (data.tags ?? []).map((tag) => tag.slug).filter(Boolean),
      content: data.content || TYPE_CONTENT_PLACEHOLDER[itemType] || "",
      namespace: data.repoId ? `repo:${data.repoId}` : "public",
      loaded: true,
      error: "",
      cursorLine: 1,
      cursorColumn: 1,
      selectedTreePath,
      treeNodes: dedupeTreeNodes(buildTreeFromPaths(filePaths)),
      fileContents,
      pendingTreeAction: null,
      pendingTreeActionLocked: false,
      selectedRevision: 0,
    })
  })

  createEffect(() => {
    const data = currentItem()
    if (!isEdit() || !data || !form.loaded) return

    const currentRevision = data.currentRevision ?? 0
    const fallbackRevision = versionOptions()[0]?.revision ?? 0
    const resolvedRevision = currentRevision > 0 && availableRevisionSet().has(currentRevision)
      ? currentRevision
      : fallbackRevision

    if (form.selectedRevision <= 0 && resolvedRevision > 0) {
      setForm("selectedRevision", resolvedRevision)
      return
    }

    if (form.selectedRevision > 0 && !availableRevisionSet().has(form.selectedRevision)) {
      setForm("selectedRevision", resolvedRevision > 0 ? resolvedRevision : 0)
    }
  })

  createEffect(() => {
    const data = currentItem()
    const version = selectedVersion()
    if (!isEdit() || !data || !version || !form.loaded) return
    if (!isViewingHistoricalVersion()) return

    const fileContents = buildFileContentsFromVersion(data, version)
    const filePaths = Object.keys(fileContents)
    const selectedTreePath = version.sourcePath || data.sourcePath || defaultSourcePathForItemType((data.itemType as ItemType) || "skill", data.slug || "") || filePaths[0] || ""

    setForm({
      name: version.name ?? data.name ?? "",
      description: version.description ?? data.description ?? "",
      category: version.category ?? data.category ?? "utilities",
      fileContents,
      treeNodes: dedupeTreeNodes(buildTreeFromPaths(filePaths)),
      selectedTreePath,
      cursorLine: 1,
      cursorColumn: 1,
      pendingTreeAction: null,
      pendingTreeActionLocked: false,
    })
  })

  createEffect(() => {
    const data = currentItem()
    if (!isEdit() || !data || !form.loaded) return
    if (isViewingHistoricalVersion()) return

    if (itemAssets.loading) return
    const fileContents = buildFileContentsFromItem(data, itemAssets() ?? [])
    const filePaths = Object.keys(fileContents)
    const selectedTreePath = data.sourcePath || defaultSourcePathForItemType((data.itemType as ItemType) || "skill", data.slug || "") || filePaths[0] || ""

    setForm({
      name: data.name || "",
      description: data.description || "",
      category: data.category || "utilities",
      fileContents,
      treeNodes: dedupeTreeNodes(buildTreeFromPaths(filePaths)),
      selectedTreePath,
    })
  })

  const wordCount = createMemo(() => {
    const text = selectedFileContent().trim()
    if (!text) return 0
    return text.split(/\s+/).filter(Boolean).length
  })

  const charCount = createMemo(() => selectedFileContent().length)

  createEffect(() => {
    const el = previewScrollEl
    const ratio = form.previewScrollRatio
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    el.scrollTop = max > 0 ? ratio * max : 0
  })

  const updateType = (value: ItemType) => {
    setForm("itemType", value)
    setForm("treeNodes", createDefaultTree(value, form.slug || ""))
    setForm("fileContents", createDefaultFileContents(value, form.slug || ""))
    setForm("selectedTreePath", defaultSourcePathForItemType(value, form.slug || ""))
    setForm("pendingTreeAction", null)
    setForm("pendingTreeActionLocked", false)
  }

  const isProtectedSkillRoot = (path: string) => form.itemType === "skill" && path === skillDisplayRootPath()
  const isProtectedSkillFile = (path: string) => form.itemType === "skill" && path === "SKILL.md"
  const displayTreeNodes = createMemo(() => {
    if (form.itemType !== "skill") return form.treeNodes
    return [{
      id: skillDisplayRootPath(),
      name: fixedSkillRoot(),
      kind: "directory" as const,
      path: skillDisplayRootPath(),
      children: form.treeNodes,
    }]
  })

  const addTreeFile = () => {
    const target = form.itemType === "skill"
      ? null
      : form.selectedTreePath && isDirectoryPath(form.treeNodes, form.selectedTreePath) ? form.selectedTreePath : null
    setForm("pendingTreeAction", { mode: "create-file", targetPath: target, draft: "new-file.md" })
  }

  const addTreeFileAt = (path: string | null) => {
    const target = path === skillDisplayRootPath()
      ? skillDisplayRootPath()
      : isDirectoryPath(form.treeNodes, path) ? path : null
    setForm("treeExpanded", target || "", (value) => target ? true : value)
    setForm("pendingTreeAction", { mode: "create-file", targetPath: target, draft: "new-file.md" })
  }

  const addTreeDirectory = () => {
    const target = form.selectedTreePath && isDirectoryPath(form.treeNodes, form.selectedTreePath) ? form.selectedTreePath : null
    if (target) setForm("treeExpanded", target, true)
    setForm("pendingTreeAction", { mode: "create-directory", targetPath: target, draft: "new-folder" })
  }

  const addTreeDirectoryAt = (path: string | null) => {
    const target = path === skillDisplayRootPath()
      ? skillDisplayRootPath()
      : isDirectoryPath(form.treeNodes, path) ? path : null
    setForm("treeExpanded", target || "", (value) => target ? true : value)
    setForm("pendingTreeAction", { mode: "create-directory", targetPath: target, draft: "new-folder" })
  }

  const renameTreeItem = (path: string) => {
    if (isViewingHistoricalVersion() || isProtectedSkillFile(path)) return
    const current = path.split("/").pop() || path
    setForm("pendingTreeAction", { mode: "rename", targetPath: path, draft: current })
  }

  const deleteTreeItem = (path: string) => {
    if (isViewingHistoricalVersion() || isProtectedSkillFile(path) || isProtectedSkillRoot(path)) return
    setForm("treeNodes", removeTreeNode(form.treeNodes, path))
    setForm("fileContents", removeFileContents(form.fileContents, path))
    if (form.selectedTreePath === path) {
      const remaining = Object.keys(removeFileContents(form.fileContents, path))
      setForm("selectedTreePath", remaining[0] ?? "")
    }
  }

  const updatePendingTreeDraft = (value: string) => {
    if (!form.pendingTreeAction) return
    setForm("pendingTreeAction", "draft", value)
  }

  const cancelPendingTreeAction = () => {
    if (form.pendingTreeActionLocked) return
    setForm("pendingTreeAction", null)
  }

  const submitPendingTreeAction = () => {
    if (form.pendingTreeActionLocked || isViewingHistoricalVersion()) return
    const pending = form.pendingTreeAction
    if (!pending) return
    setForm("pendingTreeActionLocked", true)

    const releaseLock = () => queueMicrotask(() => setForm("pendingTreeActionLocked", false))

    const name = pending.draft.trim()
    if (!name) {
      setForm("pendingTreeAction", null)
      releaseLock()
      return
    }

    if (pending.mode === "rename" && pending.targetPath) {
      const parent = pending.targetPath.includes("/") ? pending.targetPath.slice(0, pending.targetPath.lastIndexOf("/")) : ""
      const nextPath = parent ? `${parent}/${name}` : name
      if (nextPath !== pending.targetPath && treePathExists(form.treeNodes, nextPath)) {
        showToast({ title: "A file or folder with the same name already exists" })
        releaseLock()
        return
      }
      setForm("treeNodes", renameTreeNode(form.treeNodes, pending.targetPath, name))
      setForm("fileContents", renameFileContents(form.fileContents, pending.targetPath, nextPath))
      if (form.selectedTreePath === pending.targetPath) setForm("selectedTreePath", nextPath)
      setForm("pendingTreeAction", null)
      releaseLock()
      return
    }

    const safeTarget = pending.targetPath === skillDisplayRootPath()
      ? null
      : isDirectoryPath(form.treeNodes, pending.targetPath) ? pending.targetPath : null
    const base = safeTarget ? `${safeTarget}/` : ""
    const path = `${base}${name}`
    if (treePathExists(form.treeNodes, path)) {
      showToast({ title: "A file or folder with the same name already exists" })
      releaseLock()
      return
    }
    if (pending.mode === "create-directory") {
      setForm("treeNodes", appendTreeNode(form.treeNodes, safeTarget, {
        id: path,
        name,
        kind: "directory",
        path,
        children: [],
      }))
      setForm("treeExpanded", path, true)
    } else {
      setForm("treeNodes", appendTreeNode(form.treeNodes, safeTarget, {
        id: path,
        name,
        kind: "file",
        path,
        iconPath: name,
      }))
      setForm("fileContents", path, "")
      setForm("selectedTreePath", path)
    }

    setForm("pendingTreeAction", null)
    releaseLock()
  }

  const triggerDirectoryUpload = () => {
    directoryInputEl?.click()
  }

  const handleDirectoryImport = async (event: Event) => {
    const input = event.currentTarget as DirectoryInputAttributes
    const files = input.files
    if (!files || files.length === 0) return

    setForm("importing", true)

    try {
      const imported = await readDirectoryFiles(files)
      if (imported.tree.length === 0) return
      if (!imported.hasSkillFile) {
        showToast({
          title: language.t("store.capabilityEditor.uploadArchive"),
          description: language.t("store.capabilityEditor.skillFileRequired"),
        })
        return
      }

      const importedName = formatImportedTitle(imported.rootName || "")
      const importedSlug = sanitizeIdentifier(imported.rootName || "skill")
      const importedDescription = extractImportedSkillDescription(imported.contents)

      if (!form.slug.trim()) {
        setForm("slug", importedSlug)
        setForm("slugManual", true)
      }
      if (!form.name.trim() && importedName) {
        setForm("name", importedName)
      }
      if (!form.description.trim() && importedDescription) {
        setForm("description", importedDescription)
      }
      setForm("treeNodes", imported.tree)
      setForm("fileContents", imported.contents)
      setForm("selectedTreePath", imported.firstFile || Object.keys(imported.contents)[0] || "")
      setForm("pendingTreeAction", null)
      showToast({
        title: language.t("store.capabilityEditor.uploadArchive"),
        description: language.t("store.capabilityEditor.importedFiles", { count: imported.importedCount }),
        duration: 3000,
      })
      if (imported.filteredCount > 0) {
        showToast({
          variant: "error",
          icon: "warning",
          title: language.t("store.capabilityEditor.uploadArchive"),
          description: language.t("store.capabilityEditor.filteredNonTextFiles", { count: imported.filteredCount }),
          duration: 4000,
        })
      }
    } catch (error) {
      showToast({
        title: language.t("store.capabilityEditor.uploadArchive"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setForm("importing", false)
      input.value = ""
    }
  }

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(installCommand())
      setForm("installCommandCopied", true)
      setTimeout(() => setForm("installCommandCopied", false), 2000)
    } catch {
      showToast({
        title: language.t("store.itemCard.copyInstall"),
        description: language.t("common.error"),
      })
    }
  }

  const handleRestoreHistoricalVersion = async () => {
    const data = currentItem()
    const version = selectedVersion()
    if (!isEdit() || !params.itemId || !data || !version || !isViewingHistoricalVersion()) return

    setForm("saving", true)
    setForm("error", "")

    try {
      const restoredFileContents = buildFileContentsFromVersion(data, version)
      const payload = buildCapabilityPayloadFromFiles((data.itemType as ItemType) || form.itemType, data.slug || form.slug, restoredFileContents)

      await itemApi.update(params.itemId, {
        name: data.name,
        description: data.description,
        category: data.category,
        version: data.version,
        content: payload.content,
        sourcePath: payload.sourcePath,
        assets: payload.assets,
        commitMsg: `restore revision ${version.revision}`,
      })

      const refreshed = await itemApi.get(params.itemId)
      mutateItem(refreshed)
      const refreshedAssets = await itemApi.getAssets(params.itemId)
      mutateItemAssets(refreshedAssets)
      const refreshedVersions = await itemApi.listVersions(params.itemId)
      mutateVersions(refreshedVersions)
      setForm("selectedRevision", refreshed.currentRevision || version.revision)
      showToast({ title: language.t("store.capabilityEditor.restoreVersionSuccess") })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setForm("error", message)
      showToast({
        title: language.t("store.capabilityEditor.restoreVersionFailed"),
        description: message,
      })
    } finally {
      setForm("saving", false)
    }
  }

  async function resolveRegistryId() {
    const namespace = selectedNamespace()?.value
    if (namespace === "public") return (await registryApi2.getPublic()).id
    if (namespace?.startsWith("repo:")) return (await repoApi.getRegistry(namespace.slice(5))).id
    return undefined
  }

  function navigateBackWithFallback() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate("/store/manager")
  }

  function toggleSidebar() {
    setLayout("sidebarCollapsed", (value) => !value)
  }

  function confirmResetDraft() {
    dialog.show(() => (
      <ConfirmDialog
        title={language.t("store.capabilityEditor.resetTitle")}
        description={language.t("store.capabilityEditor.resetDescription")}
        confirm={language.t("common.reset")}
        variant="normal"
        onConfirm={() => resetCapabilityDraft(setForm as unknown as (setter: unknown, ...args: unknown[]) => void, form.itemType)}
      />
    ))
  }

  const handleSubmit = async (mode: "return" | "continue" = "return") => {
    if (isViewingHistoricalVersion()) {
      setForm("error", `${language.t("store.capabilityEditor.header.version")} ${form.selectedRevision} ${language.t("store.capabilityEditor.versionCurrent")}`)
      return
    }

    if (!auth.user()) {
      setForm("error", language.t("store.itemCrud.signInRequired"))
      return
    }

    if (!form.name.trim() || !form.slug.trim()) {
      setForm("error", language.t("store.capabilityEditor.validation.required"))
      return
    }

    setForm("saving", true)
    setForm("error", "")

    try {
      const payload = buildCapabilityPayloadFromFiles(form.itemType, form.slug.trim(), form.fileContents)

      if (isEdit() && params.itemId) {
        await itemApi.update(params.itemId, {
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          content: payload.content,
          sourcePath: payload.sourcePath,
          assets: payload.assets,
        })
        await itemApi.setTags(params.itemId, form.tags)
        showToast({ title: language.t("store.capabilityDialog.toast.updated", { type: typeLabel() }) })
      } else {
        const registryId = await resolveRegistryId()
        const userId = auth.user()?.id ?? auth.user()?.subjectId ?? auth.user()?.sub
        await itemApi.createDirect({
          itemType: form.itemType,
          name: form.name.trim(),
          slug: form.slug.trim(),
          description: form.description.trim(),
          category: form.category,
          content: payload.content,
          sourcePath: payload.sourcePath,
          assets: payload.assets,
          tags: form.tags,
          visibility: selectedNamespace()?.visibility,
          registryId,
          createdBy: userId,
        })
        showToast({ title: language.t("store.capabilityDialog.toast.created", { type: typeLabel() }) })
        if (mode === "continue") {
          resetCapabilityDraft(setForm as unknown as (setter: unknown, ...args: unknown[]) => void, form.itemType)
          return
        }
      }

      navigateBackWithFallback()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setForm("error", message)
      showToast({
        title: isEdit()
          ? language.t("store.capabilityDialog.toast.updateFailed", { type: typeLabel() })
          : language.t("store.capabilityDialog.toast.createFailed", { type: typeLabel() }),
        description: message,
      })
    } finally {
      setForm("saving", false)
    }
  }

  const loading = createMemo(() => auth.loading() || (isEdit() && item.loading))

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Show when={!loading()} fallback={<div class="flex flex-1 items-center justify-center bg-background-base text-sm text-text-weak">{language.t("store.loading")}</div>}>
        <div
          class="relative flex min-h-0 flex-1 overflow-hidden"
          style={{
            background: `color-mix(in srgb, ${accent()} 3%, var(--native-surface))`,
          }}
        >
          <aside
            class="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden transition-[width,opacity,border-color] duration-200 ease-out"
            style={{
              width: layout.sidebarCollapsed ? "0px" : `${layout.sidebarWidth}px`,
              opacity: layout.sidebarCollapsed ? 0 : 1,
              "border-right": layout.sidebarCollapsed ? "0px solid transparent" : `1px solid color-mix(in srgb, ${accent()} 16%, transparent)`,
              background: `color-mix(in srgb, ${accent()} 6%, var(--native-panel))`,
            }}
          >
            <div
              class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto transition-opacity duration-150 ease-out"
              classList={{
                "pointer-events-none p-0": layout.sidebarCollapsed,
                "p-4": !layout.sidebarCollapsed,
              }}
            >
              <input
                ref={directoryInputEl}
                type="file"
                multiple
                class="hidden"
                onChange={(e) => void handleDirectoryImport(e)}
              />
              <div class="flex min-h-0 flex-1 flex-col gap-5">
                <section class="space-y-3">
                  <div>
                    <div
                      class="text-[11px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: `color-mix(in srgb, ${accent()} 52%, var(--native-muted))` }}
                    >
                      {isEdit() ? language.t("store.capabilityEditor.header.version") : language.t("store.capabilityDialog.create.type")}
                    </div>
                  </div>

                  <Show
                    when={isEdit()}
                    fallback={
                      <div class="relative min-w-0">
                        <select
                          value={form.itemType}
                          disabled={isEdit()}
                          onInput={(e) => updateType(e.currentTarget.value as ItemType)}
                          class="h-8 min-w-0 w-full appearance-none rounded-[6px] bg-background-base pl-2.5 pr-9 text-xs text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                        >
                          <For each={["skill", "subagent", "command", "mcp"] as const}>
                            {(type) => <option value={type}>{typeDropdownLabel(type)}</option>}
                          </For>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-[var(--native-muted)]">
                          <Icon name="chevron-down" size="small" class="shrink-0" />
                        </div>
                      </div>
                    }
                  >
                    <div class="space-y-2">
                      <div class="relative min-w-0">
                        <select
                          value={String(form.selectedRevision || currentItem()?.currentRevision || 0)}
                          onInput={(e) => setForm("selectedRevision", Number(e.currentTarget.value) || 0)}
                          disabled={selectedVersion.loading}
                          class="h-8 min-w-0 w-full appearance-none rounded-[6px] bg-background-base pl-2.5 pr-9 text-xs text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                        >
                          <For each={versionOptions()}>
                            {(version) => (
                              <option value={version.revision}>
                                {version.versionLabel || `v${version.revision}`}
                                {formatVersionCreatedAt(version.createdAt) ? ` · ${formatVersionCreatedAt(version.createdAt)}` : ""}
                                {version.revision === currentItem()?.currentRevision ? ` · ${language.t("store.capabilityEditor.versionCurrent")}` : ""}
                              </option>
                            )}
                          </For>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-[var(--native-muted)]">
                          <Icon name="chevron-down" size="small" class="shrink-0" />
                        </div>
                      </div>
                    </div>
                  </Show>
                </section>

                <Show when={isViewingHistoricalVersion()}>
                  <section
                    class="space-y-2 rounded-[8px] border px-3 py-3"
                    style={{
                      border: `1px solid color-mix(in srgb, ${accent()} 20%, var(--native-border))`,
                      background: `color-mix(in srgb, ${accent()} 8%, var(--native-panel))`,
                    }}
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.08em]"
                        style={{
                          background: `color-mix(in srgb, ${accent()} 14%, transparent)`,
                          color: `color-mix(in srgb, ${accent()} 70%, var(--native-foreground))`,
                        }}
                      >
                        {language.t("store.capabilityEditor.versionReadonlyBadge")}
                      </span>
                    </div>
                    <div class="text-xs leading-5 text-[var(--native-muted)]">
                      {language.t("store.capabilityEditor.versionReadonlyDescription")}
                    </div>
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        class="h-8 px-3"
                        onClick={() => void handleRestoreHistoricalVersion()}
                        disabled={form.saving || selectedVersion.loading}
                      >
                        {language.t("store.capabilityEditor.restoreVersion")}
                      </Button>
                    </div>
                  </section>
                </Show>

                <section class="space-y-3 border-t border-[color:color-mix(in_oklab,var(--native-border)_18%,transparent)] pt-4">
                  <div>
                    <div
                      class="text-[11px] font-semibold uppercase tracking-[0.12em]"
                      style={{ color: `color-mix(in srgb, ${accent()} 52%, var(--native-muted))` }}
                    >
                      {language.t("store.capabilityEditor.sections.basic")}
                    </div>
                  </div>

                  <div class="space-y-3">
                    <Show when={!isEdit()}>
                      <div class="flex items-center gap-3">
                        <label class="w-16 shrink-0 text-xs font-medium text-[var(--native-foreground)]">{language.t("store.capabilityEditor.header.owner")}</label>
                        <div class="relative min-w-0 flex-1">
                          <select
                            value={form.namespace}
                            onInput={(e) => setForm("namespace", e.currentTarget.value)}
                            class="h-8 min-w-0 w-full appearance-none rounded-[6px] bg-background-base pl-2.5 pr-9 text-xs text-[var(--native-foreground)]"
                            style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                          >
                            <For each={namespaceOptions()}>
                              {(option) => <option value={option.value}>{option.label}</option>}
                            </For>
                          </select>
                          <div class="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-[var(--native-muted)]">
                            <Icon name="chevron-down" size="small" class="shrink-0" />
                          </div>
                        </div>
                      </div>
                    </Show>

                    <div class="flex items-center gap-3">
                      <label class="w-16 shrink-0 text-xs font-medium text-[var(--native-foreground)]">{language.t("store.capabilityEditor.header.name")}</label>
                      <input
                        value={form.name}
                        onInput={(e) => setForm("name", e.currentTarget.value)}
                        disabled={isViewingHistoricalVersion()}
                        placeholder={language.t("store.capabilityDialog.field.displayNamePlaceholder", { type: typeLabel() })}
                        class="h-8 min-w-0 flex-1 rounded-[6px] border bg-background-base px-2.5 text-xs text-[var(--native-foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                      />
                    </div>

                    <div class="flex items-center gap-3">
                      <label class="w-16 shrink-0 text-xs font-medium text-[var(--native-foreground)]">{language.t("store.capabilityEditor.header.identifier")}</label>
                      <input
                        value={form.slug}
                        onInput={(e) => {
                          const nextSlug = sanitizeIdentifier(e.currentTarget.value)
                          setForm("slug", nextSlug)
                          setForm("slugManual", true)
                        }}
                        disabled={isViewingHistoricalVersion()}
                        placeholder={`my-${form.itemType}`}
                        pattern="[A-Za-z0-9_-]*"
                        class="h-8 min-w-0 flex-1 rounded-[6px] border bg-background-base px-2.5 font-mono text-xs text-[var(--native-foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                      />
                    </div>

                    <div class="flex items-center gap-3">
                      <label class="w-16 shrink-0 text-xs font-medium text-[var(--native-foreground)]">{language.t("store.capabilityDialog.field.category")}</label>
                      <div class="relative min-w-0 flex-1">
                        <select
                          value={form.category}
                          onInput={(e) => setForm("category", e.currentTarget.value)}
                          disabled={isViewingHistoricalVersion()}
                          class="h-8 min-w-0 w-full appearance-none rounded-[6px] bg-background-base pl-2.5 pr-9 text-xs text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                        >
                          <For each={categoryOptions()}>
                            {(category) => <option value={category}>{itemFilterOptions.categoryLabel(category)}</option>}
                          </For>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-[var(--native-muted)]">
                          <Icon name="chevron-down" size="small" class="shrink-0" />
                        </div>
                      </div>
                    </div>
                  </div>

                    <Show when={!isViewingHistoricalVersion()}>
                      <div class="space-y-2">
                        <label class="mb-1 block text-xs font-medium text-[var(--native-foreground)]">{language.t("store.capabilityEditor.header.tags")}</label>
                        <TagInput
                          value={form.tags}
                          disabled={isViewingHistoricalVersion()}
                          placeholder={language.t("store.capabilityEditor.tagsPlaceholder")}
                          placeholderSecondary={language.t("store.capabilityEditor.tagsPlaceholderSecondary")}
                          lockedTags={isEdit() ? (currentItem()?.tags ?? []).filter((tag) => tag.tagClass === "system").map((tag) => tag.slug) : []}
                          class="w-full text-[var(--native-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                          onChange={(value) => setForm("tags", value)}
                        />
                      </div>
                    </Show>

                    <div class="space-y-2">
                      <label class="mb-1 block text-xs font-medium text-[var(--native-foreground)]">{language.t("store.capabilityDialog.field.description")}</label>
                      <textarea
                        value={form.description}
                        onInput={(e) => setForm("description", e.currentTarget.value)}
                        disabled={isViewingHistoricalVersion()}
                        rows={8}
                        placeholder={language.t("store.capabilityDialog.field.descriptionPlaceholder")}
                        class="w-full resize-none rounded-[6px] bg-background-base px-3 py-2 text-sm text-[var(--native-foreground)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                      />
                    </div>
                  </section>

                <Show when={form.itemType === "skill"}>
                  <section class="flex min-h-0 flex-1 flex-col space-y-3 border-t border-[color:color-mix(in_oklab,var(--native-border)_18%,transparent)] pt-4">
                    <div class="flex items-center justify-between gap-2">
                      <div
                        class="text-[11px] font-semibold uppercase tracking-[0.12em]"
                        style={{ color: `color-mix(in srgb, ${accent()} 52%, var(--native-muted))` }}
                      >
                        {language.t("store.capabilityEditor.sections.files")}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="h-7 cursor-pointer border px-2 text-xs transition-colors"
                        disabled={isViewingHistoricalVersion() || form.importing}
                        style={{
                          border: `1px solid color-mix(in srgb, ${accent()} 24%, var(--native-border))`,
                          background: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (isViewingHistoricalVersion() || form.importing) return
                          e.currentTarget.style.background = `color-mix(in srgb, ${accent()} 12%, transparent)`
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent"
                        }}
                        onClick={triggerDirectoryUpload}
                      >
                        {form.importing ? `${language.t("common.loading")}${language.t("common.loading.ellipsis")}` : language.t("store.capabilityEditor.uploadArchive")}
                      </Button>
                    </div>

                    <div
                      ref={treeScrollEl}
                      class="min-h-0 flex-1 overflow-y-auto rounded-[6px] bg-background-base text-sm"
                      style={{ border: `1px solid color-mix(in srgb, ${accent()} 18%, var(--native-border))` }}
                    >
                      <WorkspaceLikeTree
                        nodes={displayTreeNodes()}
                        selectedPath={form.selectedTreePath}
                        expanded={form.treeExpanded}
                        onToggle={(path) => setForm("treeExpanded", path, (value) => !value)}
                        onSelect={(path) => setForm("selectedTreePath", path)}
                        onRename={renameTreeItem}
                        onDelete={deleteTreeItem}
                        onCreateFile={addTreeFileAt}
                        onCreateDirectory={addTreeDirectoryAt}
                        canToggle={(path) => !isProtectedSkillRoot(path)}
                        canRename={(path) => !isViewingHistoricalVersion() && !isProtectedSkillFile(path) && !isProtectedSkillRoot(path)}
                        canDelete={(path) => !isViewingHistoricalVersion() && !isProtectedSkillFile(path) && !isProtectedSkillRoot(path)}
                        pendingAction={form.pendingTreeAction}
                        onPendingDraftChange={updatePendingTreeDraft}
                        onPendingSubmit={submitPendingTreeAction}
                        onPendingCancel={cancelPendingTreeAction}
                        readOnly={isViewingHistoricalVersion()}
                      />
                    </div>

                  </section>
                </Show>

                <Show when={form.error}>
                  <div class="rounded-[6px] border border-[color:color-mix(in_oklab,#ef4444_35%,transparent)] bg-[color:color-mix(in_oklab,#ef4444_10%,transparent)] px-3 py-2 text-sm text-[#dc2626]">
                    {form.error}
                  </div>
                </Show>
              </div>
            </div>
          </aside>

          <Show when={!layout.sidebarCollapsed}>
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={layout.sidebarWidth}
              min={260}
              max={420}
              onResize={(size) => setLayout("sidebarWidth", size)}
            />
          </Show>

          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <div class="relative z-10 flex items-center justify-between gap-3 border-b border-[color:color-mix(in_srgb,var(--native-border)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--native-panel)_80%,var(--native-surface))] px-4 py-2.5 shadow-[0_2px_4px_-1px_rgba(15,23,42,0.08)]">
              <div class="min-w-0 flex flex-1 items-center overflow-hidden">
                <div class="flex min-w-0 w-full max-w-[48rem] items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    class="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--native-border)_48%,transparent)] text-[var(--native-muted)] transition-all duration-150 hover:bg-[var(--native-hover)] hover:text-[var(--native-foreground)]"
                    title={layout.sidebarCollapsed ? language.t("store.capabilityEditor.sidebarExpand") : language.t("store.capabilityEditor.sidebarCollapse")}
                  >
                    <Icon name={layout.sidebarCollapsed ? "chevron-right" : "chevron-left"} size="small" />
                  </button>
                  <span class="shrink-0 text-xs text-[var(--native-muted)]">{language.t("store.capabilityEditor.commandPreview")}</span>
                  <div class="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-3" style="background-color: var(--native-surface-strong)">
                  <div class="thin-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
                    <code class="select-all whitespace-nowrap text-12-mono text-[var(--native-muted)]">{installCommand()}</code>
                  </div>
                  <button
                    onClick={() => void copyInstallCommand()}
                    class="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--native-muted)] transition-all duration-150 hover:bg-[var(--native-hover)] hover:text-[var(--native-foreground)]"
                    title={language.t("store.itemCard.copyInstall")}
                  >
                    <Icon name={form.installCommandCopied ? "check-small" : "copy"} size="small" class={form.installCommandCopied ? "text-green-500" : ""} />
                  </button>
                  </div>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <Button type="button" size="sm" variant="outline" class="h-8 px-3" onClick={() => navigate("/store/manager")}>
                  {language.t("store.capabilityEditor.backToManagement")}
                </Button>
                <Show
                  when={!isEdit()}
                  fallback={
                    <Button type="button" size="sm" class="h-8 px-3" onClick={() => void handleSubmit()} disabled={loading() || form.saving || isViewingHistoricalVersion()}>
                      {form.saving ? language.t("common.saving") : language.t("store.capabilityEditor.saveAndReturn")}
                    </Button>
                  }
                >
                  <div class="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" class="h-8 px-3" onClick={confirmResetDraft} disabled={loading() || form.saving || isViewingHistoricalVersion()}>
                      {language.t("common.reset")}
                    </Button>
                    <div class="flex items-center overflow-hidden rounded-[8px]">
                    <Button type="button" size="sm" class="h-8 rounded-r-none px-3" onClick={() => void handleSubmit("return")} disabled={loading() || form.saving || isViewingHistoricalVersion()}>
                      {form.saving ? language.t("common.saving") : language.t("store.capabilityEditor.createAction")}
                    </Button>
                    <DropdownMenu placement="bottom-end" gutter={4}>
                      <DropdownMenu.Trigger
                        class="inline-flex h-8 items-center justify-center border-l border-[color:color-mix(in_srgb,var(--native-border)_28%,transparent)] bg-[var(--native-primary)] px-2 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loading() || form.saving || isViewingHistoricalVersion()}
                        aria-label={language.t("store.capabilityEditor.createOptions")}
                      >
                        <Icon name="chevron-down" size="small" style={{ color: "white", "stroke-width": 2.2 }} />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content class="min-w-[180px]">
                          <DropdownMenu.Item onSelect={() => void handleSubmit("continue")}>
                            <DropdownMenu.ItemLabel>{language.t("store.capabilityEditor.createAndContinue")}</DropdownMenu.ItemLabel>
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu>
                    </div>
                  </div>
                </Show>
              </div>

            </div>

            <div classList={{
              "grid min-h-0 min-w-0 flex-1": true,
              "grid-cols-2": showPreview(),
              "grid-cols-1": !showPreview(),
            }}>
              <section
                class="flex min-h-0 flex-col"
                style={{
                  "border-right": showPreview() ? "1px solid color-mix(in srgb, var(--native-border) 18%, transparent)" : "none",
                }}
              >
                <MarkdownCodeEditor
                  path={activeFilePath()}
                  value={selectedFileContent()}
                  editable={!isViewingHistoricalVersion()}
                  onChange={(value) => {
                    if (isViewingHistoricalVersion()) return
                    setForm("fileContents", form.selectedTreePath, value)
                  }}
                  onCursorChange={({ line, column }) => {
                    setForm("cursorLine", line)
                    setForm("cursorColumn", column)
                  }}
                  onScrollRatioChange={(ratio) => setForm("previewScrollRatio", ratio)}
                />
              </section>

              <Show when={showPreview()}>
                <section
                  class="flex min-h-0 flex-col"
                  style={{ background: "#ffffff" }}
                >
                  <div ref={previewScrollEl} class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <Show
                      when={selectedFileContent().trim()}
                      fallback={<div class="rounded-[var(--native-radius-md)] border border-dashed border-border-weak-base px-4 py-6 text-sm text-[var(--native-muted)]">{language.t("store.capabilityEditor.previewEmpty")}</div>}
                    >
                      <Markdown text={selectedFileContent()} class="vscode-markdown text-14-regular" />
                    </Show>
                  </div>
                </section>
              </Show>
            </div>

            <div class="flex items-center justify-between border-t border-[color:color-mix(in_srgb,var(--native-border)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--native-panel)_80%,var(--native-surface))] px-4 py-2 text-xs text-[var(--native-muted)]">
              <div class="min-w-0 truncate font-mono">{statusBarFilePath()}</div>
              <div class="flex items-center gap-4">
                <span>Ln {form.cursorLine}, Col {form.cursorColumn}</span>
                <span>{wordCount()} words</span>
                <span>{charCount()} chars</span>
                <span>{currentLanguageLabel()}</span>
              </div>
            </div>

            <Show when={form.saving}>
              <div class="absolute inset-0 z-[120] flex items-center justify-center bg-black/16 backdrop-blur-[1.5px]">
                <div class="flex items-center gap-3 px-4 py-3">
                  <Spinner class="size-4 text-[var(--native-primary)]" />
                  <span class="text-sm text-[var(--native-foreground)]">{language.t("common.loading")}{language.t("common.loading.ellipsis")}</span>
                </div>
              </div>
            </Show>

          </div>
        </div>
      </Show>
    </div>
  )
}
