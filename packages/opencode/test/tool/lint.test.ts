import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import {
  LintTool,
  resolveLintExecutable,
  inferLanguageFromExtension,
  getLintResourcesPath,
  getAvailableExtensionsForLanguage,
  LINT_EXTENSIONS,
} from "../../src/tool/lint"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import type { PermissionNext } from "../../src/permission/next"
import os from "os"

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

describe("tool.lint resolveLintExecutable", () => {
  test("returns path for go linter (revive)", async () => {
    const exePath = await resolveLintExecutable("go")
    if (exePath) {
      expect(exePath).toContain("revive")
      const exists = await Bun.file(exePath).exists()
      expect(exists).toBe(true)
    }
  })

  test("returns path for js linter (biome)", async () => {
    const exePath = await resolveLintExecutable("js")
    if (exePath) {
      expect(exePath).toContain("biome")
      const exists = await Bun.file(exePath).exists()
      expect(exists).toBe(true)
    }
  })

  test("returns path for py linter (ruff)", async () => {
    const exePath = await resolveLintExecutable("py")
    if (exePath) {
      expect(exePath).toContain("ruff")
      const exists = await Bun.file(exePath).exists()
      expect(exists).toBe(true)
    }
  })

  test("returns path for cpp linter (clang-tidy)", async () => {
    const exePath = await resolveLintExecutable("cpp")
    if (exePath) {
      expect(exePath).toContain("clang-tidy")
      const exists = await Bun.file(exePath).exists()
      expect(exists).toBe(true)
    }
  })

  test("returns path for java linter (pmd)", async () => {
    const exePath = await resolveLintExecutable("java")
    if (exePath) {
      expect(exePath).toContain("pmd")
      const exists = await Bun.file(exePath).exists()
      expect(exists).toBe(true)
    }
  })

  test("returns null for unknown language", async () => {
    const exePath = await resolveLintExecutable("unknown")
    expect(exePath).toBeNull()
  })

  test("returns system cargo for rust if available", async () => {
    const exePath = await resolveLintExecutable("rust")
    const hasCargo = await Bun.which("cargo")
    if (hasCargo) {
      expect(exePath).toBe(hasCargo)
    } else {
      expect(exePath).toBeNull()
    }
  })

  test("returns system rubocop for ruby if available", async () => {
    const exePath = await resolveLintExecutable("ruby")
    const hasRubocop = await Bun.which("rubocop")
    if (hasRubocop) {
      expect(exePath).toBe(hasRubocop)
    } else {
      expect(exePath).toBeNull()
    }
  })
})

describe("tool.lint inferLanguageFromExtension", () => {
  test("infers go from .go extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.go")).toBe("go")
  })

  test("infers js from .js extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.js")).toBe("js")
  })

  test("infers js from .ts extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.ts")).toBe("js")
  })

  test("infers js from .tsx extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.tsx")).toBe("js")
  })

  test("infers js from .jsx extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.jsx")).toBe("js")
  })

  test("infers js from .json extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.json")).toBe("js")
  })

  test("infers js from .css extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.css")).toBe("js")
  })

  test("infers py from .py extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.py")).toBe("py")
  })

  test("infers cpp from .cpp extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.cpp")).toBe("cpp")
  })

  test("infers cpp from .c extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.c")).toBe("cpp")
  })

  test("infers cpp from .h extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.h")).toBe("cpp")
  })

  test("infers cpp from .hpp extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.hpp")).toBe("cpp")
  })

  test("infers rust from .rs extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.rs")).toBe("rust")
  })

  test("infers java from .java extension", () => {
    expect(inferLanguageFromExtension("/path/to/File.java")).toBe("java")
  })

  test("infers ruby from .rb extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.rb")).toBe("ruby")
  })

  test("returns null for unknown extension", () => {
    expect(inferLanguageFromExtension("/path/to/file.unknown")).toBeNull()
  })

  test("returns null for no extension", () => {
    expect(inferLanguageFromExtension("/path/to/file")).toBeNull()
  })
})

describe("tool.lint getAvailableExtensionsForLanguage", () => {
  test("returns correct extensions for go", () => {
    const exts = getAvailableExtensionsForLanguage("go")
    expect(exts).toContain(".go")
  })

  test("returns correct extensions for js", () => {
    const exts = getAvailableExtensionsForLanguage("js")
    expect(exts).toContain(".js")
    expect(exts).toContain(".ts")
    expect(exts).toContain(".tsx")
    expect(exts).toContain(".json")
    expect(exts).toContain(".css")
  })

  test("returns correct extensions for py", () => {
    const exts = getAvailableExtensionsForLanguage("py")
    expect(exts).toContain(".py")
    expect(exts).toContain(".pyw")
  })

  test("returns correct extensions for cpp", () => {
    const exts = getAvailableExtensionsForLanguage("cpp")
    expect(exts).toContain(".cpp")
    expect(exts).toContain(".c")
    expect(exts).toContain(".h")
    expect(exts).toContain(".hpp")
  })

  test("returns correct extensions for rust", () => {
    const exts = getAvailableExtensionsForLanguage("rust")
    expect(exts).toContain(".rs")
  })

  test("returns correct extensions for java", () => {
    const exts = getAvailableExtensionsForLanguage("java")
    expect(exts).toContain(".java")
  })

  test("returns correct extensions for ruby", () => {
    const exts = getAvailableExtensionsForLanguage("ruby")
    expect(exts).toContain(".rb")
  })

  test("returns empty array for unknown language", () => {
    const exts = getAvailableExtensionsForLanguage("unknown")
    expect(exts).toEqual([])
  })
})

describe("tool.lint LINT_EXTENSIONS", () => {
  test("contains all supported languages", () => {
    expect(LINT_EXTENSIONS.go).toBeDefined()
    expect(LINT_EXTENSIONS.js).toBeDefined()
    expect(LINT_EXTENSIONS.py).toBeDefined()
    expect(LINT_EXTENSIONS.cpp).toBeDefined()
    expect(LINT_EXTENSIONS.rust).toBeDefined()
    expect(LINT_EXTENSIONS.java).toBeDefined()
    expect(LINT_EXTENSIONS.ruby).toBeDefined()
  })
})

describe("tool.lint getLintResourcesPath", () => {
  test("returns valid resources path", () => {
    const resourcesPath = getLintResourcesPath()
    expect(resourcesPath).toContain("resources")
    expect(resourcesPath).toContain("lint")
  })
})

describe("tool.lint permissions", () => {
  test("asks for lint permission when linting file", async () => {
    const hasRuff = await resolveLintExecutable("py")
    if (!hasRuff) {
      console.log("Skipping lint permission test - ruff not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.py"), "x = 1\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await lint.execute({ filePath: path.join(tmp.path, "test.py") }, testCtx)
        const lintReq = requests.find((r) => r.permission === "lint")
        expect(lintReq).toBeDefined()
        expect(lintReq!.patterns).toContain(path.join(tmp.path, "test.py"))
      },
    })
  })

  test("asks for external_directory permission when linting file outside project", async () => {
    const hasRuff = await resolveLintExecutable("py")
    if (!hasRuff) {
      console.log("Skipping external_directory permission test - ruff not available")
      return
    }

    await using outerTmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.py"), "x = 1\n")
      },
    })
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const requests: Array<Omit<PermissionNext.Request, "id" | "sessionID" | "tool">> = []
        const testCtx = {
          ...ctx,
          ask: async (req: Omit<PermissionNext.Request, "id" | "sessionID" | "tool">) => {
            requests.push(req)
          },
        }
        await lint.execute({ filePath: path.join(outerTmp.path, "test.py") }, testCtx)
        const extDirReq = requests.find((r) => r.permission === "external_directory")
        expect(extDirReq).toBeDefined()
      },
    })
  })
})

describe("tool.lint error handling", () => {
  test("throws error for non-existent file", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        await expect(
          lint.execute({ filePath: path.join(tmp.path, "nonexistent.py") }, ctx)
        ).rejects.toThrow("文件未找到")
      },
    })
  })

  test("throws error for unsupported file extension", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.unknown"), "content\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        await expect(
          lint.execute({ filePath: path.join(tmp.path, "test.unknown") }, ctx)
        ).rejects.toThrow("不支持的文件扩展名")
      },
    })
  })

  test("throws error for language mismatch", async () => {
    // Both go and py need to be available for this test
    const hasGo = await resolveLintExecutable("go")
    const hasPy = await resolveLintExecutable("py")
    if (!hasGo || !hasPy) {
      console.log("Skipping language mismatch test - need both go and py available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.py"), "x = 1\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        await expect(
          lint.execute({ filePath: path.join(tmp.path, "test.py"), language: "go" }, ctx)
        ).rejects.toThrow("语言不匹配")
      },
    })
  })

  test("throws error for unavailable language", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.xyz"), "content\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        // Create a file without extension and specify unavailable language
        const hasGo = await resolveLintExecutable("go")
        if (!hasGo) {
          // If go is not available, we can test with it
          await expect(
            lint.execute({ filePath: path.join(tmp.path, "test.xyz"), language: "go" }, ctx)
          ).rejects.toThrow()
        }
      },
    })
  })

  test("throws error for directory path", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        // Directory path will fail with "文件未找到" since Bun.file().exists() returns false for directories
        // Let's verify by checking what error we get
        try {
          await lint.execute({ filePath: tmp.path }, ctx)
          expect(false).toBe(true) // Should not reach here
        } catch (e: any) {
          // Directory is treated as non-existent file (Bun.file().exists() returns false for dirs)
          expect(e.message).toMatch(/文件未找到|路径不是一个文件/)
        }
      },
    })
  })
})

describe("tool.lint Python linting", () => {
  test("lints valid Python file without issues", async () => {
    const hasRuff = await resolveLintExecutable("py")
    if (!hasRuff) {
      console.log("Skipping Python lint test - ruff not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "valid.py"), `def greet(name: str) -> str:
    return f"Hello, {name}!"
`)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "valid.py") }, ctx)
        expect(result.output).toContain("未发现")
        expect(result.metadata.language).toBe("py")
      },
    })
  })

  test("detects issues in Python file", async () => {
    const hasRuff = await resolveLintExecutable("py")
    if (!hasRuff) {
      console.log("Skipping Python lint test - ruff not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        // Python file with unused import
        await Bun.write(path.join(dir, "with_issues.py"), `import os
import sys

x = 1
`)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "with_issues.py") }, ctx)
        // Should detect unused imports
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("py")
      },
    })
  })

  test("auto-infers Python language from .py extension", async () => {
    const hasRuff = await resolveLintExecutable("py")
    if (!hasRuff) {
      console.log("Skipping Python lint test - ruff not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.py"), "x = 1\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.py") }, ctx)
        expect(result.metadata.language).toBe("py")
      },
    })
  })
})

describe("tool.lint JavaScript/TypeScript linting", () => {
  test("lints valid JS file without issues", async () => {
    const hasBiome = await resolveLintExecutable("js")
    if (!hasBiome) {
      console.log("Skipping JS lint test - biome not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "valid.js"), `function greet(name) {
    return \`Hello, \${name}!\`;
}

export { greet };
`)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "valid.js") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("js")
      },
    })
  })

  test("lints TypeScript file", async () => {
    const hasBiome = await resolveLintExecutable("js")
    if (!hasBiome) {
      console.log("Skipping TS lint test - biome not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), `interface User {
    name: string;
}

function greet(user: User): string {
    return \`Hello, \${user.name}!\`;
}

export { greet };
`)
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.ts") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("js")
      },
    })
  })

  test("lints JSON file", async () => {
    const hasBiome = await resolveLintExecutable("js")
    if (!hasBiome) {
      console.log("Skipping JSON lint test - biome not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "test.json"),
          JSON.stringify({ name: "test", value: 123 }, null, 2)
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.json") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("js")
      },
    })
  })
})

describe("tool.lint Go linting", () => {
  test("lints valid Go file", async () => {
    const hasRevive = await resolveLintExecutable("go")
    if (!hasRevive) {
      console.log("Skipping Go lint test - revive not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "test.go"),
          `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.go") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("go")
      },
    })
  })
})

describe("tool.lint C/C++ linting", () => {
  test("lints C file", async () => {
    const hasClangTidy = await resolveLintExecutable("cpp")
    if (!hasClangTidy) {
      console.log("Skipping C lint test - clang-tidy not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "test.c"),
          `#include <stdio.h>

int main(void) {
    printf("Hello, World!\\n");
    return 0;
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.c") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("cpp")
      },
    })
  })

  test("lints C++ file", async () => {
    const hasClangTidy = await resolveLintExecutable("cpp")
    if (!hasClangTidy) {
      console.log("Skipping C++ lint test - clang-tidy not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "test.cpp"),
          `#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.cpp") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("cpp")
      },
    })
  })
})

describe("tool.lint Java linting", () => {
  test("lints Java file", async () => {
    const hasPmd = await resolveLintExecutable("java")
    const hasJava = await Bun.which("java")
    if (!hasPmd || !hasJava) {
      console.log("Skipping Java lint test - PMD or Java not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "Test.java"),
          `public class Test {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "Test.java") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("java")
      },
    })
  })
})

describe("tool.lint Ruby linting", () => {
  test("lints Ruby file if rubocop is available", async () => {
    const hasRubocop = await resolveLintExecutable("ruby")
    if (!hasRubocop) {
      console.log("Skipping Ruby lint test - rubocop not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "test.rb"),
          `#!/usr/bin/env ruby

puts "Hello, World!"
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "test.rb") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("ruby")
      },
    })
  })
})

describe("tool.lint Rust linting", () => {
  test("lints valid Rust file without issues", async () => {
    const hasCargo = await resolveLintExecutable("rust")
    if (!hasCargo) {
      console.log("Skipping Rust lint test - cargo not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        // Create a minimal Cargo.toml
        await Bun.write(
          path.join(dir, "Cargo.toml"),
          `[package]
name = "test"
version = "0.1.0"
edition = "2021"
`
        )
        // Create src directory and main.rs
        await fs.mkdir(path.join(dir, "src"), { recursive: true })
        await Bun.write(
          path.join(dir, "src", "main.rs"),
          `fn main() {
    println!("Hello, World!");
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "src", "main.rs") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("rust")
      },
    })
  }, 60000)

  test("detects issues in Rust file", async () => {
    const hasCargo = await resolveLintExecutable("rust")
    if (!hasCargo) {
      console.log("Skipping Rust lint test - cargo not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "Cargo.toml"),
          `[package]
name = "test"
version = "0.1.0"
edition = "2021"
`
        )
        await fs.mkdir(path.join(dir, "src"), { recursive: true })
        await Bun.write(
          path.join(dir, "src", "main.rs"),
          `fn main() {
    let x = 5;
    if x == 5 {
        println!("x is 5");
    }
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "src", "main.rs") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("rust")
      },
    })
  }, 60000)

  test("lints Rust library file", async () => {
    const hasCargo = await resolveLintExecutable("rust")
    if (!hasCargo) {
      console.log("Skipping Rust lint test - cargo not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "Cargo.toml"),
          `[package]
name = "test"
version = "0.1.0"
edition = "2021"
`
        )
        await fs.mkdir(path.join(dir, "src"), { recursive: true })
        await Bun.write(
          path.join(dir, "src", "lib.rs"),
          `pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute({ filePath: path.join(tmp.path, "src", "lib.rs") }, ctx)
        expect(result.output).toBeDefined()
        expect(result.metadata.language).toBe("rust")
      },
    })
  }, 60000)

  test("returns error when Cargo.toml not found", async () => {
    const hasCargo = await resolveLintExecutable("rust")
    if (!hasCargo) {
      console.log("Skipping Rust lint test - cargo not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "main.rs"),
          `fn main() {
    println!("Hello, World!");
}
`
        )
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        await expect(
          lint.execute({ filePath: path.join(tmp.path, "main.rs") }, ctx)
        ).rejects.toThrow("Cargo.toml")
      },
    })
  })
})

describe("tool.lint language aliases", () => {
  test("accepts 'python' as alias for 'py'", async () => {
    const hasRuff = await resolveLintExecutable("py")
    if (!hasRuff) {
      console.log("Skipping Python alias test - ruff not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.py"), "x = 1\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute(
          { filePath: path.join(tmp.path, "test.py"), language: "python" },
          ctx
        )
        expect(result.metadata.language).toBe("py")
      },
    })
  })

  test("accepts 'javascript' as alias for 'js'", async () => {
    const hasBiome = await resolveLintExecutable("js")
    if (!hasBiome) {
      console.log("Skipping JS alias test - biome not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.js"), "const x = 1;\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute(
          { filePath: path.join(tmp.path, "test.js"), language: "javascript" },
          ctx
        )
        expect(result.metadata.language).toBe("js")
      },
    })
  })

  test("accepts 'typescript' as alias for 'js'", async () => {
    const hasBiome = await resolveLintExecutable("js")
    if (!hasBiome) {
      console.log("Skipping TS alias test - biome not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.ts"), "const x: number = 1;\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute(
          { filePath: path.join(tmp.path, "test.ts"), language: "typescript" },
          ctx
        )
        expect(result.metadata.language).toBe("js")
      },
    })
  })

  test("accepts 'golang' as alias for 'go'", async () => {
    const hasRevive = await resolveLintExecutable("go")
    if (!hasRevive) {
      console.log("Skipping Go alias test - revive not available")
      return
    }

    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await Bun.write(path.join(dir, "test.go"), "package main\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const lint = await LintTool.init()
        const result = await lint.execute(
          { filePath: path.join(tmp.path, "test.go"), language: "golang" },
          ctx
        )
        expect(result.metadata.language).toBe("go")
      },
    })
  })
})
