# Test Guide for opencode

This guide provides instructions for testing the opencode project.

## Runnability Verification Commands

Run the following command to build the project:

```bash
bun run build --skip-install --single
```

This command will:
- Build the project without installing dependencies
- Run in single-package mode
- Compile the TypeScript code and prepare it for execution

## Test Case Management

### File Location

All test files are located in the `test/` directory at the root of the project.

### Naming Convention

Test files follow the naming pattern: `*.test.ts`

Examples:
- `test/tool/read.test.ts`
- `test/session/session.test.ts`
- `test/config/config.test.ts`

### Directory Organization

Tests are organized by module/function in subdirectories:
- `test/command/` - Command-related tests
- `test/tool/` - Tool functionality tests
- `test/util/` - Utility function tests
- `test/session/` - Session management tests
- `test/config/` - Configuration tests
- `test/agent/` - Agent behavior tests
- `test/provider/` - Provider integration tests
- `test/server/` - Server endpoint tests
- `test/cli/` - CLI interface tests

### Test Framework

Tests use the `bun test` framework with the following structure:

```typescript
import { describe, expect, test } from "bun:test"

describe("feature name", () => {
  test("test case description", async () => {
    // Test implementation
    expect(result).toBe(expected)
  })
})
```

## Test Execution

### Run All Tests

```bash
bun test
```

This command runs all test files in the `test/` directory.

### Run Specific Test File

```bash
bun test test/tool/tool.test.ts
```

Replace the file path with the specific test file you want to run.

### Run Tests in a Specific Directory

```bash
bun test test/tool/
```

This runs all tests within the specified directory.
