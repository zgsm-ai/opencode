import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { FileOutlineTool } from "../../src/costrict/tool/file-outline"
import { tmpdir } from "../fixture/fixture"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

const pick = (output: string, name: string) => {
  const lines = output.split(/\r?\n/)
  const match = lines.find((line) => /^\s+\d+:\s+/.test(line) && line.includes(name)) ?? ""
  return match.replace(/^\s+\d+:\s+/, "").trimEnd()
}

const run = async (dir: string, filename: string, content: string) => {
  const filePath = path.join(dir, filename)
  await Bun.write(filePath, content)
  return Instance.provide({
    directory: dir,
    fn: async () => {
      const tool = await FileOutlineTool.init()
      return tool.execute({ file_path: filePath, include_docstrings: true }, ctx)
    },
  })
}

const perl = await Bun.file(
  path.join(import.meta.dir, "../../src/costrict/tool/wasm/tree-sitter-perl.wasm"),
).exists()

describe("tool.file_outline multi-language parsing", () => {
  const core = [
    {
      name: "python",
      filename: "sample.py",
      symbol: "add",
      content: [
        "def add(",
        "  a: int,",
        "  b: int",
        ") -> int:",
        '  """Add numbers"""',
        "  return a + b",
      ].join("\n"),
      parts: ["def add(", "a: int", "b: int", ") -> int:"],
      doc: "Add numbers",
    },
    {
      name: "javascript",
      filename: "sample.js",
      symbol: "add",
      content: [
        "/** Adds two numbers */",
        "function add(",
        "  a,",
        "  b",
        ") {",
        "  return a + b",
        "}",
      ].join("\n"),
      parts: ["function add(", "a", "b", ") {"],
      doc: "Adds two numbers",
    },
    {
      name: "typescript",
      filename: "sample.ts",
      symbol: "add",
      content: [
        "/** Adds two numbers */",
        "export function add<T>(",
        "  a: T,",
        "  b: T",
        "): T {",
        "  return a",
        "}",
      ].join("\n"),
      parts: ["function add", "a: T", "b: T", "): T {"],
      doc: "Adds two numbers",
    },
    {
      name: "go",
      filename: "sample.go",
      symbol: "add",
      content: [
        "package main",
        "",
        "// Adds two numbers",
        "func add(",
        "  a int,",
        "  b int",
        ") int {",
        "  return a + b",
        "}",
      ].join("\n"),
      parts: ["func add(", "a int", "b int", ") int {"],
      doc: "Adds two numbers",
    },
    {
      name: "java",
      filename: "Sample.java",
      symbol: "add",
      content: [
        "public class Sample {",
        "  /** Adds two numbers */",
        "  public int add(",
        "    int a,",
        "    int b",
        "  ) {",
        "    return a + b;",
        "  }",
        "}",
      ].join("\n"),
      parts: ["public int add(", "int a", "int b", ") {"],
      doc: "Adds two numbers",
    },
    {
      name: "c",
      filename: "sample.c",
      symbol: "add",
      content: [
        "int add(",
        "  int a,",
        "  int b",
        ") {",
        "  return a + b;",
        "}",
      ].join("\n"),
      parts: ["int add(", "int a", "int b", ") {"],
    },
    {
      name: "cpp",
      filename: "sample.cpp",
      symbol: "add",
      content: [
        "int add(",
        "  int a,",
        "  int b",
        ") {",
        "  return a + b;",
        "}",
      ].join("\n"),
      parts: ["int add(", "int a", "int b", ") {"],
    },
    {
      name: "rust",
      filename: "sample.rs",
      symbol: "add",
      content: [
        "/// Adds two numbers",
        "fn add(",
        "  a: i32,",
        "  b: i32,",
        ") -> i32 {",
        "  a + b",
        "}",
      ].join("\n"),
      parts: ["fn add(", "a: i32", "b: i32", ") -> i32 {"],
      doc: "Adds two numbers",
    },
    {
      name: "ruby",
      filename: "sample.rb",
      symbol: "add",
      content: [
        "# Adds two numbers",
        "def add(",
        "  a,",
        "  b",
        ")",
        "  a + b",
        "end",
      ].join("\n"),
      parts: ["def add(", "a", "b", ")"],
      doc: "Adds two numbers",
    },
    {
      name: "php",
      filename: "Sample.php",
      symbol: "add",
      content: [
        "<?php",
        "class Sample {",
        "  /** Adds two numbers */",
        "  public function add(",
        "    int $a,",
        "    int $b",
        "  ): int {",
        "    return $a + $b;",
        "  }",
        "}",
      ].join("\n"),
      parts: ["function add(", "int $a", "int $b", "): int {"],
      doc: "Adds two numbers",
    },
  ]

  const cases = [
    ...core,
    ...(perl
      ? [
          {
            name: "perl",
            filename: "sample.pl",
            symbol: "add",
            content: [
              "# Adds two numbers",
              "sub add {",
              "  my ($a, $b) = @_;",
              "  return $a + $b;",
              "}",
            ].join("\n"),
            parts: ["sub add {"],
            doc: "Adds two numbers",
          },
          {
            name: "perl",
            filename: "complex.pl",
            symbol: "clone",
            content: [
              "package Demo;",
              "use overload '@{}' => sub { shift->parts }, fallback => 1;",
              "",
              "sub canonicalize {",
              "  my $parts = shift->parts;",
              "  for (my $i = 0; $i <= $#$parts;) {",
              "    if ($i < 1) { $i++ }",
              "    elsif ($i > 1) { $i-- }",
              "    else { $i++ }",
              "  }",
              "  return $parts;",
              "}",
              "",
              "# Clones current object",
              "sub clone {",
              "  return shift;",
              "}",
            ].join("\n"),
            parts: ["sub clone {"],
            doc: "Clones current object",
          },
          {
            name: "perl",
            filename: "regex-heavy.pl",
            symbol: "to_string",
            content: [
              "package Demo;",
              "sub path_query {",
              "  my ($self, $pq) = @_;",
              "  return $self unless $pq =~ /^([^?#]*)(?:\\?([^#]*))?/;",
              "  return $self;",
              "}",
              "sub protocol { lc(shift // '') }",
              "sub to_string { shift }",
            ].join("\n"),
            parts: ["sub to_string {"],
          },
          {
            name: "perl",
            filename: "pod-safe.pl",
            symbol: "real",
            content: [
              "package Demo;",
              "=head1 METHODS",
              "sub fake {",
              "  return 0;",
              "}",
              "=cut",
              "",
              "# Real doc",
              "sub real {",
              "  return 1;",
              "}",
            ].join("\n"),
            parts: ["sub real {"],
            doc: "Real doc",
            absent: ["sub fake {"],
          },
        ]
      : []),
  ]

  test.each(cases)("$name captures multi-line signature", async (entry) => {
    await using tmp = await tmpdir()
    const result = await run(tmp.path, entry.filename, entry.content)
    expect(result.metadata.definition_count).toBeGreaterThan(0)
    expect(result.output.startsWith(`${entry.filename}:`)).toBe(true)
    expect(result.output).toContain("definitions found")
    const signature = pick(result.output, entry.symbol)
    for (const part of entry.parts) {
      expect(signature).toContain(part)
    }
    if (entry.doc) {
      expect(result.output).toContain(entry.doc)
    }
    if ("absent" in entry && entry.absent) {
      for (const part of entry.absent) {
        expect(result.output).not.toContain(part)
      }
    }
  })
})
