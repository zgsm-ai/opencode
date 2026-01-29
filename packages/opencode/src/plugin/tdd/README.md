# TDD Plugin Usage Guide

## Overview

The TDD (Test-Driven Development) plugin provides runnability verification capabilities for OpenCode. It helps ensure code can be compiled, built, and tested during development.

## Features

### 1. Built-in `/test` Command

Command: `/test`

A comprehensive testing workflow command that automatically:

- Checks if `run_and_fix` has been executed recently
- Runs `run_and_fix` if code has been modified or verification is outdated
- Confirms user requirements for testing
- Generates test cases using `test_design` agent
- Executes tests using `test_and_fix` agent

This ensures the project is always verified to be buildable/runnable before proceeding with testing.

### 2. Test Design Subagent

Agent: `test_design`

Specialized agent for designing comprehensive test points and generating test case plans based on functional requirements or code.

### 3. Test And Fix Subagent

Agent: `test_and_fix`

Executes tests and automatically diagnoses and fixes test failures. Analyzes test output, locates issues, applies fixes, and validates results.

### 4. Run And Fix Subagent

Agent: `run_and_fix`

This specialized subagent automatically finds and executes verification commands, and fixes coding issues to ensure the project can run or compile successfully.

**Capabilities:**

- Detects project type and programming language
- Identifies and executes verification commands (compile, build, test)
- Fixes coding-related issues (syntax errors, type errors, missing imports, logic bugs)
- Re-runs verification after each fix
- Handles non-coding issues by reporting them and exiting

**Usage:**

The agent is automatically available as a subagent. When runnability verification is needed:

1. Invoke the `run_and_fix` agent
2. The agent will automatically:
   - Detect the project type
   - Find verification commands
   - Execute verification (compile → build → test)
   - Fix any coding issues found
   - Re-run verification after each fix
3. If non-coding issues are encountered, the agent will report them and exit

**Agent Behavior:**

For **Compiled Languages** (C, C++, Go, Rust, Java):

- Finds verification commands (Makefile, CMakeLists.txt, Cargo.toml, go.mod, etc.)
- Executes compilation/build commands
- Executes test commands
- Fixes any coding errors encountered

For **Interpreted Languages** (JavaScript, TypeScript, Python):

- Finds package.json scripts or requirements files
- Executes build and test commands
- Fixes any coding errors encountered

**Output Format:**

```markdown
# Runnability Verification Report

## Summary

Executed verification commands: [commands used]
Final status: [PASSING/FAILED/WITH_ERRORS]

## Commands Executed

### Compilation (if applicable)

[command output]

### Build (if applicable)

[command output]

### Testing

[command output]

## Issues Found and Fixed

### Fix 1

- File: [file path]
- Issue: [description]
- Fix Applied: [what was changed]
- Verification: [result after fix]

## Non-Coding Issues (if any)

[Description]

## Final Status

- [x] Project compiles/builds successfully
- [x] Tests pass
```

**Fixable Issues:**

- Syntax errors
- TypeScript type errors
- Missing imports
- Logic bugs causing test failures

**Non-Fixable Issues (Agent will exit and report):**

- Missing dependencies (requires npm install, etc.)
- Network errors
- Environment setup issues
- Permission issues
- External system failures

### 4. Automatic Memory Injection

The plugin automatically injects:

- Existing memory content into system prompts
- TDD guidance instructions for development workflow

This ensures both the main agent and any subagents have access to:

- Project runnability guides
- Previous verification steps
- Session context

**Note: Memory injection applies to the main agent context. Subagent injection is controlled by the session configuration.**

## Workflow

### Using the `test` Command

When using the `/test` built-in command:

1. **Check Runnability**: The command automatically checks if `run_and_fix` agent has been executed recently
2. **Verify if Needed**: If code has been modified or `run_and_fix` hasn't been run recently, it executes `run_and_fix` first to ensure the project can build/run
3. **Confirm Requirements**: After project is verified, the command confirms the testing requirements
4. **Generate Test Cases**: Uses `test_design` agent to create comprehensive test plans
5. **Execute Tests**: Uses `test_and_fix` agent to run tests and fix any failures
6. **Handle Issues**: If `run_and_fix` reports non-coding issues, resolve them manually before proceeding with testing

### Manual Development Flow

1. **Start Development**: Begin coding as usual
2. **Complete Feature**: After finishing a significant amount of code (e.g., completing a task)
3. **Verify Project**: Use `run_and_fix` agent to ensure project can run/compile
4. **Design Tests**: Use `test_design` agent to create comprehensive test plans (optional)
5. **Run Tests**: Use `test_and_fix` agent to execute tests and fix failures
6. **Handle Non-Coding Issues**: If `run_and_fix` agent reports non-coding issues, resolve them manually and re-run verification
7. **Continue**: Once verification passes, continue with remaining features

## Example Usage

### Using the Built-in `/test` Command

The `/test` command automatically:

1. Checks if `run_and_fix` has been executed recently
2. Runs `run_and_fix` if code has been modified or verification is outdated
3. Generates test cases using `test_design` agent
4. Executes tests using `test_and_fix` agent

```bash
/test
# OR
/test "login module unit tests"
```

### Designing Test Cases Manually

```typescript
// From main agent or another subagent:
{
  "tool": "subagent",
  "args": {
    "name": "test_design",
    "prompt": "Design comprehensive test cases for this feature."
  }
}
```

### Executing Tests and Fixing Failures

```typescript
// From main agent or another subagent:
{
  "tool": "subagent",
  "args": {
    "name": "test_and_fix",
    "prompt": "Run the tests and fix any failures."
  }
}
```

```typescript
// From main agent or another subagent:
{
  "tool": "subagent",
  "args": {
    "name": "run_and_fix",
    "prompt": "Verify this project can run and fix any coding issues."
  }
}
```

## Automatic System Prompt Injection

The plugin automatically adds system prompts like:

```
# TDD Guidance
After completing a significant amount of feature code, you should perform runnability verification:

1. Use the "run_and_fix" subagent to verify the project:
   - The agent will automatically find and execute verification commands (compile, build, test)
   - It will fix any coding issues encountered (syntax errors, type errors, logic bugs)
   - For non-coding issues (missing dependencies, environment problems), it will report them and exit
2. If verification passes, continue with remaining feature development
3. If the agent reports non-coding issues that need manual intervention, resolve them and run verification again

The "run_and_fix" agent is available as a subagent for automatic verification and fixing of coding issues.
```

## Registration

The TDD plugin is automatically registered as a built-in plugin in `src/plugin/index.ts`. It runs on startup and provides:

- System prompt transformation for memory injection
- Coding guidance for development workflow

## File Structure

```
src/plugin/tdd/
├── agents/
│   ├── index.ts                    # Exports all agents and constants
│   ├── run-and-fix.ts             # Run and fix agent
│   ├── test-design.ts              # Test design agent
│   ├── test-and-fix.ts             # Test and fix agent
│   ├── constants.ts                # Agent name constants
│   └── prompts/
│       ├── run_and_fix.txt
│       ├── test_design.txt
│       └── test_and_fix.txt
├── handlers/
│   ├── index.ts                    # Exports all handlers
│   ├── config-handler.ts           # Plugin config handler
│   └── system-transform-handler.ts # System prompt transform handler
├── utils/
│   └── test-guide-discovery.ts  # TEST_GUIDE.md discovery
├── types.ts                        # Type definitions
├── index.ts                        # Plugin main file
└── README.md                       # Documentation
```

## Limitations

- Agent only fixes coding issues (syntax, type errors, logic bugs)
- Non-coding issues require manual intervention (npm install, environment setup, etc.)
- Maximum 3 fix attempts per verification run
- Verification analysis is heuristic-based and may need manual adjustment

### Advanced Features

### Agent Metadata

The run and fix agent includes metadata for integration with the main agent selection system:

```typescript
export const RUN_AND_FIX_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "FREE",
  triggers: [
    {
      domain: "Runnability",
      trigger: "Execute verification commands and fix coding issues",
    },
  ],
  useWhen: [
    "Need to verify project can run or compile",
    "Executing build/test commands and fixing resulting issues",
    "Ensuring project is in a working state",
  ],
  avoidWhen: ["Analyzing project structure", "Writing new features", "Code review"],
}
```

### Supported Languages

The agent supports:

**Compiled Languages:**

- C/C++ (gcc, g++, clang, cmake, make)
- Go (go build, go test)
- Rust (cargo build, cargo test)
- Java (javac, maven, gradle)

**Interpreted Languages:**

- JavaScript/TypeScript (npm, bun, yarn, pnpm)
- Python (pytest, unittest, pip)

### Custom Configuration

You can override agent behavior in `.opencode/oh-my-opencode.json`:

```jsonc
{
  "agents": {
    "run_and_fix": {
      "model": "anthropic/claude-sonnet-4-5",
      "temperature": 0.1,
      "prompt_append": "\n\nFocus on providing specific, actionable fixes for coding issues.",
    },
  },
}
```
