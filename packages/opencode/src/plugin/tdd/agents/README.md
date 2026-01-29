# TDD Plugin - Agent Module

This directory contains all agent definitions for the TDD plugin.

## Agents

### 1. Test Prepare Agent (`test-prepare.ts`)

- **Purpose**: Checks and prepares TEST_GUIDE.md for completeness
- **Usage**: Starting work on a new project, verifying project testing configuration
- **Key Features**:
  - Checks TEST_GUIDE.md completeness
  - Searches project to identify testing configuration
  - Fills in missing sections in TEST_GUIDE.md
  - Reports findings and actions taken

### 2. Runnability Analyzer (`runnability-analyzer.ts`)

- **Purpose**: Analyzes project structure to determine how to verify code works
- **Usage**: Creating runnability verification guide
- **Key Features**:
  - Detects project type (compiled/interpreted)
  - Finds build/test infrastructure
  - Identifies compiler commands
  - Generates runnability guide

### 2. Test Design Agent (`test-design.ts`)

- **Purpose**: Designs comprehensive test points and generates test plan documents
- **Usage**: Planning test strategy for new features
- **Key Features**:
  - Analyzes functional requirements or code
  - Generates structured test cases in Markdown
  - Integrates TEST_GUIDE.md content

### 3. Test and Fix Agent (`test-and-fix.ts`)

- **Purpose**: Executes tests and automatically diagnoses/fixes failures
- **Usage**: Running tests and fixing failures
- **Key Features**:
  - Analyzes test output
  - Locates issues and applies fixes
  - Validates results
  - Integrates TEST_GUIDE.md content

## Usage

```typescript
import { createRunnabilityAnalysisAgent, createTestDesignAgent, createTestAndFixAgent } from "./agents"

// Create agents
const runnabilityAgent = createRunnabilityAnalysisAgent("model-id")
const testDesignAgent = await createTestDesignAgent("model-id")
const testAndFixAgent = await createTestAndFixAgent("model-id")
```

## Agent Metadata

Each agent exports metadata describing its purpose and usage:

- `RUNNABILITY_ANALYZER_PROMPT_METADATA`
- `TEST_DESIGN_PROMPT_METADATA`
- `TEST_AND_FIX_PROMPT_METADATA`

These are used for agent discovery and documentation.

## Agent Constants

Agent names are exported as constants to avoid typos and enable type-safe configuration:

```typescript
import { RUNNABILITY_ANALYZER_AGENT_NAME, TEST_DESIGN_AGENT_NAME, TEST_AND_FIX_AGENT_NAME } from "./agents"
```

Use these constants when:

- Registering agents in plugin config
- Referencing agents in system guidance or prompts
- Type-safe agent name usage

Example:

```typescript
config.agent[RUNNABILITY_ANALYZER_AGENT_NAME] = await createRunnabilityAnalysisAgent(model)
```
