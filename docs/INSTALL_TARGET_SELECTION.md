# Install Target Selection

This document explains how installer download target selection is aligned with runtime binary resolution.

## Goal

Keep the install scripts and runtime launcher consistent, so downloaded artifacts match what the `cs` entry script looks for.

## Runtime Source of Truth

Runtime package resolution is implemented in `packages/opencode/bin/cs`.

Current rule:

- Base package name format: `@costrict/cs-<platform>-<arch>`
- Append `-baseline` when:
  - `platform === windows`, or
  - `platform === linux && arch === x64`

Reference: `packages/opencode/bin/cs:59`

## Installer Mapping

Install scripts must generate the same target naming intent.

### Unix installer (`install.sh`)

- Detects `os` from `uname -s`
- Detects `arch` from `uname -m` with mapping:
  - `x86_64 -> x64`
  - `aarch64 -> arm64`
- Uses target format: `costrict-cs-<os>-<arch>`
- Appends `-baseline` for `linux + x64`
- Appends `-musl` when musl libc is detected

Reference: `install.sh:268`

### Windows installer (`install.bat`)

- Detects `arch` from `%PROCESSOR_ARCHITECTURE%` and `%PROCESSOR_ARCHITEW6432%`
- Uses target format: `costrict-cs-windows-<arch>`
- Appends `-baseline` for `windows + x64`
- Keeps `windows + arm64` non-baseline

Reference: `install.bat:192`

## Consistency Matrix

| Platform | Arch  | Runtime expects baseline | Installer downloads baseline |
| -------- | ----- | ------------------------ | ---------------------------- |
| linux    | x64   | yes                      | yes                          |
| linux    | arm64 | no                       | no                           |
| windows  | x64   | yes                      | yes                          |
| windows  | arm64 | no                       | no                           |
| darwin   | x64   | no                       | no                           |
| darwin   | arm64 | no                       | no                           |

## Why this matters

If installer and runtime rules diverge, users can hit errors like:

- installer downloads non-baseline package
- launcher searches baseline package
- runtime fails with package/binary not found

Keeping a single rule across install and runtime avoids this class of failures.
