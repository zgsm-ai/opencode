#!/usr/bin/env bash
set -euo pipefail

MUTED='\033[0;2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

BASE_URL=${COSTRICT_BASE_URL:-"https://zgsm.sangfor.com"}
export COSTRICT_BASE_URL=${COSTRICT_BASE_URL:-"https://zgsm.sangfor.com"}

# Unified error exit with cause and fix suggestions
die() {
    echo -e "${RED}Error: $1${NC}" >&2
    [ -n "${2:-}" ] && echo -e "$2" >&2
    [ -n "${3:-}" ] && echo -e "$3" >&2
    exit 1
}

usage() {
    cat <<EOF
CoStrict Installer

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 1.0.180)
    -b, --binary <path>     Install from a local binary instead of downloading

Environment Variables:
    COSTRICT_BASE_URL       Base URL for downloading (default: https://zgsm.sangfor.com)

Examples:
    curl -fsSL ${BASE_URL}/costrict-cli/install | bash
    curl -fsSL ${BASE_URL}/costrict-cli/install | bash -s -- --version 1.0.180
    COSTRICT_BASE_URL=https://custom.com curl -fsSL https://example.com/install | bash
    ./install.sh --binary /path/to/cs
EOF
}

requested_version=${VERSION:-}
binary_path=""
ENV_UPDATED=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--version)
            if [[ -n "${2:-}" ]]; then
                requested_version="$2"
                shift 2
            else
                die "--version requires a version argument"
            fi
            ;;
        -b|--binary)
            if [[ -n "${2:-}" ]]; then
                binary_path="$2"
                shift 2
            else
                die "--binary requires a path argument"
            fi
            ;;
        *)
            echo -e "${YELLOW}Warning: Unknown option '$1'${NC}" >&2
            shift
            ;;
    esac
done

INSTALL_DIR=$HOME/.costrict/bin
mkdir -p "$INSTALL_DIR"

# ============================================================
# Pre-install environment checks
# ============================================================
pre_install_checks() {
    local has_warning=0
    local skip_network=${1:-false}

    echo -e "${MUTED}Running pre-install checks...${NC}"

    # 1. Check required tools
    if [ "$skip_network" = "false" ]; then
        if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
            die "Neither 'curl' nor 'wget' found" \
                "  Install curl with your package manager:" \
                "    Ubuntu/Debian: sudo apt install curl\n    RHEL/CentOS:   sudo yum install curl\n    macOS:         brew install curl"
        fi
    fi

    if ! command -v tar >/dev/null 2>&1 && [ "$skip_network" = "false" ]; then
        die "'tar' is required but not found" \
            "  Install tar with your package manager:" \
            "    Ubuntu/Debian: sudo apt install tar\n    RHEL/CentOS:   sudo yum install tar"
    fi

    # 2. Warn if running as root
    if [ "$(id -u)" = "0" ]; then
        echo -e "${YELLOW}Warning: Running as root. Binary will be installed to ${INSTALL_DIR}${NC}"
        echo "  This may cause permission issues for non-root users."
        echo "  Consider running as the target user instead."
        has_warning=1
    fi

    # 3. Check if 'cs' already exists from a different location
    if command -v cs >/dev/null 2>&1; then
        local existing_cs
        existing_cs=$(command -v cs)
        if [ "$existing_cs" != "${INSTALL_DIR}/cs" ]; then
            echo -e "${YELLOW}Warning: 'cs' already exists at: ${existing_cs}${NC}"
            echo "  This installation will place cs at ${INSTALL_DIR}/cs"
            echo "  PATH order will determine which 'cs' runs first."
            echo "  To remove the old one: rm \"${existing_cs}\""
            has_warning=1
        fi
    fi

    # 4. Check for existing installation
    if [ -f "${INSTALL_DIR}/cs" ]; then
        local existing_version
        existing_version=$("${INSTALL_DIR}/cs" --version 2>/dev/null || echo "unknown")
        echo -e "${MUTED}Note: Existing installation found (version: ${existing_version}). It will be overwritten.${NC}"
    fi

    # 5. Check COSTRICT_BASE_URL custom value
    if [ -n "${COSTRICT_BASE_URL:-}" ] && [ "$COSTRICT_BASE_URL" != "https://zgsm.sangfor.com" ]; then
        echo -e "${MUTED}Note: Using custom COSTRICT_BASE_URL: ${COSTRICT_BASE_URL}${NC}"
    fi

    # 6. Check disk space (need at least 200MB for download + extraction)
    if command -v df >/dev/null 2>&1; then
        local available_mb
        available_mb=$(df -m "$(dirname "${INSTALL_DIR}")" 2>/dev/null | awk 'NR==2{print $4}')
        if [ -n "$available_mb" ] && [ "$available_mb" -lt 200 ] 2>/dev/null; then
            echo -e "${YELLOW}Warning: Low disk space (${available_mb}MB available). At least 200MB recommended.${NC}"
            echo "  Fix: Free up disk space in $(dirname "${INSTALL_DIR}")"
            has_warning=1
        fi
    fi

    # 7. Network connectivity check (skip for --binary installs)
    if [ "$skip_network" = "false" ] && command -v curl >/dev/null 2>&1; then
        if ! curl -fsS --connect-timeout 5 --max-time 10 -o /dev/null "${BASE_URL}" 2>/dev/null; then
            echo -e "${YELLOW}Warning: Cannot reach ${BASE_URL}${NC}"
            echo "  Possible causes:"
            echo "    - No internet connection"
            echo "    - Firewall blocking the connection"
            echo "    - Proxy configuration needed (set https_proxy)"
            echo "  Fix: Check your network connection and try again"
            has_warning=1
        fi
    fi

    if [ "$has_warning" -gt 0 ]; then
        echo ""
        echo -e "${MUTED}Proceeding with installation despite warnings...${NC}"
        echo ""
    else
        echo -e "${GREEN}  All pre-install checks passed${NC}"
    fi
}

# ============================================================
# Post-install verification
# ============================================================
post_install_verify() {
    local all_ok=1

    echo ""
    echo -e "${MUTED}Running post-install verification...${NC}"

    # 1. Binary exists and is executable
    if [ -x "${INSTALL_DIR}/cs" ]; then
        echo -e "${GREEN}  [PASS] Binary exists and is executable${NC}"
    else
        echo -e "${RED}  [FAIL] Binary not found or not executable at ${INSTALL_DIR}/cs${NC}"
        echo "    Fix: chmod 755 ${INSTALL_DIR}/cs"
        all_ok=0
    fi

    # 2. Binary runs (version check)
    if [ -x "${INSTALL_DIR}/cs" ]; then
        local ver_output
        if ver_output=$("${INSTALL_DIR}/cs" --version 2>&1); then
            echo -e "${GREEN}  [PASS] Binary runs successfully (version: ${ver_output})${NC}"
        else
            echo -e "${RED}  [FAIL] Binary exists but failed to execute${NC}"
            echo "    Possible causes:"
            echo "      - Missing shared library (run: ldd ${INSTALL_DIR}/cs)"
            echo "      - Wrong architecture binary downloaded"
            echo "      - Corrupted download (re-run installer)"
            all_ok=0
        fi
    fi

    # 3. PATH verification
    if [[ ":$PATH:" == *":${INSTALL_DIR}:"* ]]; then
        echo -e "${GREEN}  [PASS] ${INSTALL_DIR} is in current PATH${NC}"
    else
        echo -e "${YELLOW}  [WARN] ${INSTALL_DIR} is NOT in current PATH (will be after shell restart)${NC}"
        echo "    Fix (for this session): export PATH=${INSTALL_DIR}:\$PATH"
    fi

    # 4. COSTRICT_BASE_URL verification
    if [ -n "${COSTRICT_BASE_URL:-}" ]; then
        echo -e "${GREEN}  [PASS] COSTRICT_BASE_URL is set to: ${COSTRICT_BASE_URL}${NC}"
    else
        echo -e "${YELLOW}  [WARN] COSTRICT_BASE_URL is not set in current session${NC}"
        echo "    Fix: export COSTRICT_BASE_URL=https://zgsm.sangfor.com"
    fi

    echo ""
    if [ "$all_ok" -eq 1 ]; then
        echo -e "${GREEN}All verification checks passed.${NC}"
    else
        echo -e "${RED}Some checks failed. See above for fix suggestions.${NC}"
    fi
}

# Handle --binary fast path
if [ -n "$binary_path" ]; then
    pre_install_checks "true"
    if [ ! -f "$binary_path" ]; then
        die "Binary not found at ${binary_path}" \
            "  Possible causes:" \
            "    - File path is incorrect\n    - File was moved or deleted\n  Fix: Verify the file exists: ls -la \"${binary_path}\""
    fi
    echo -e "${MUTED}Installing ${NC}cs ${MUTED}from: ${NC}$binary_path"
    cp "$binary_path" "${INSTALL_DIR}/cs"
    chmod 755 "${INSTALL_DIR}/cs"
    echo -e "${GREEN}✓ Installed successfully${NC}"
    post_install_verify
    exit 0
fi

# Run full pre-install checks (including network)
pre_install_checks "false"

raw_os=$(uname -s)
os=$(echo "$raw_os" | tr '[:upper:]' '[:lower:]')
case "$raw_os" in
  Darwin*) os="darwin" ;;
  Linux*) os="linux" ;;
  MINGW*|MSYS*|CYGWIN*) os="windows" ;;
esac

arch=$(uname -m)
if [[ "$arch" == "aarch64" ]]; then
  arch="arm64"
fi
if [[ "$arch" == "x86_64" ]]; then
  arch="x64"
fi

if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
  rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
  if [ "$rosetta_flag" = "1" ]; then
    arch="arm64"
  fi
fi

target="costrict-cs-$os-$arch"

# Keep download target in sync with packages/opencode/bin/cs resolution:
# - linux x64 always uses baseline
# - windows always uses baseline (handled by install.bat)
# - darwin x64 uses non-baseline
if [ "$os" = "linux" ] && [ "$arch" = "x64" ]; then
  target="$target-baseline"
fi

# Detect musl libc (use flag to avoid double-appending)
is_musl=false
if [ "$os" = "linux" ]; then
  if [ -f /etc/alpine-release ]; then
    is_musl=true
  elif command -v ldd >/dev/null 2>&1; then
    if ldd --version 2>&1 | grep -qi musl; then
      is_musl=true
    fi
  fi
fi
if [ "$is_musl" = "true" ]; then
  target="$target-musl"
fi

if [ -z "$requested_version" ]; then
  echo -e "${MUTED}No version specified, fetching latest version from server...${NC}"
  latest_url="${BASE_URL}/costrict-cli/pkg/latest.json"

  # Fetch latest version from latest.json
  if command -v curl >/dev/null 2>&1; then
    requested_version=$(curl -fsSL --connect-timeout 15 --max-time 30 "${latest_url}" 2>/dev/null | grep -o '"tag_name":[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  elif command -v wget >/dev/null 2>&1; then
    requested_version=$(wget -qO- --timeout=30 "${latest_url}" 2>/dev/null | grep -o '"tag_name":[[:space:]]*"[^"]*"' | cut -d'"' -f4)
  fi

  if [ -z "$requested_version" ]; then
    die "Failed to fetch latest version from ${latest_url}" \
        "  Possible causes:\n    - Server is unreachable or returned an error\n    - DNS resolution failed\n    - Network proxy is not configured" \
        "  Fix:\n    - Check your network connection: curl -v ${latest_url}\n    - Or specify a version manually: install.sh -v <VERSION>"
  fi
  echo -e "${MUTED}Using latest version: ${NC}${requested_version}"
fi

requested_version="${requested_version#v}"

archive_ext=".tar.gz"
download_url="${BASE_URL}/costrict-cli/pkg/${requested_version}/${target}${archive_ext}"

echo -e "${MUTED}Downloading cs version: ${NC}${requested_version}"
echo -e "${MUTED}Target: ${NC}${target}"
echo -e "${MUTED}URL: ${NC}${download_url}"

tmp_dir="${TMPDIR:-/tmp}/costrict-cli-$$"
mkdir -p "$tmp_dir"
archive_path="${tmp_dir}/${target}${archive_ext}"

curl_exit=0
if command -v curl >/dev/null 2>&1; then
    if [ -t 2 ]; then
        if ! curl -f -# -L --connect-timeout 30 --max-time 300 -o "$archive_path" "$download_url"; then
            curl_exit=$?
        fi
    else
        if ! curl -f -s -L --connect-timeout 30 --max-time 300 -o "$archive_path" "$download_url"; then
            curl_exit=$?
        fi
    fi
elif command -v wget >/dev/null 2>&1; then
    if [ -t 2 ]; then
        if ! wget --progress=bar:force:noscroll --timeout=30 -O "$archive_path" "$download_url"; then
            curl_exit=$?
        fi
    else
        if ! wget -q --timeout=30 -O "$archive_path" "$download_url"; then
            curl_exit=$?
        fi
    fi
else
    die "Neither 'curl' nor 'wget' found" \
        "  Install curl or wget with your package manager:" \
        "    Ubuntu/Debian: sudo apt install curl\n    RHEL/CentOS:   sudo yum install curl\n    macOS:         brew install curl"
fi

if [ $curl_exit -ne 0 ] || [ ! -f "$archive_path" ] || [ ! -s "$archive_path" ]; then
    rm -rf "$tmp_dir"
    die "Download failed (curl exit code: ${curl_exit})" \
        "  Possible causes:\n    - Version ${requested_version} does not exist for platform ${target}\n    - Network connection was interrupted\n    - Server returned HTTP error (404/500)\n    - Disk is full" \
        "  Fix:\n    - Verify the URL is accessible: curl -I \"${download_url}\"\n    - Try a different version: install.sh -v <VERSION>\n    - Check available disk space: df -h ${tmp_dir}"
fi

echo -e "${MUTED}Extracting archive...${NC}"
if ! tar -xzf "$archive_path" -C "$tmp_dir" 2>&1; then
    rm -rf "$tmp_dir"
    die "Failed to extract archive" \
        "  Possible causes:\n    - Downloaded file is corrupted or truncated\n    - Downloaded file is not a valid tar.gz archive (possibly an HTML error page)" \
        "  Fix:\n    - Re-run the installer to download again\n    - Manually check the file: file \"${archive_path}\""
fi

binary_source="${tmp_dir}/bin/cs"
    if [ ! -f "$binary_source" ]; then
        rm -rf "$tmp_dir"
        die "Binary not found in extracted archive" \
            "  Possible causes:\n    - Archive structure is unexpected (expected bin/cs)\n    - Wrong platform/architecture detected (detected: ${target})\n    - Download was corrupted" \
            "  Fix:\n    - Re-run the installer\n    - Try a different version: install.sh -v <VERSION>\n    - Report this issue if it persists"
    fi

    mv "$binary_source" "${INSTALL_DIR}/cs"
    chmod 755 "${INSTALL_DIR}/cs"
    rm -rf "$tmp_dir"

    echo -e "${GREEN}✓ Installed successfully to: ${NC}${INSTALL_DIR}/cs"

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}
current_shell=$(basename "$SHELL")

add_to_path() {
    local config_file=$1
    local command=$2
    local base_url_export=${3:-}

    if grep -Fxq "$command" "$config_file" 2>/dev/null; then
        echo -e "${MUTED}PATH already configured in $config_file${NC}"
        return
    fi

    if [[ -w $config_file ]]; then
        echo -e "\n# costrict" >> "$config_file"
        echo "$command" >> "$config_file"
        if [[ -n "$base_url_export" ]]; then
            echo "$base_url_export" >> "$config_file"
        fi
        echo -e "${GREEN}✓ Added cs to PATH in ${NC}$config_file"
        ENV_UPDATED=1
    else
        echo -e "${YELLOW}Warning: Cannot write to $config_file (permission denied)${NC}"
        echo "  Manually add the following lines to your shell config:"
        echo "    $command"
        if [[ -n "$base_url_export" ]]; then
            echo "    $base_url_export"
        fi
    fi
}

case $current_shell in
    fish)
        config_files="$HOME/.config/fish/config.fish"
        ;;
    zsh)
        config_files="${ZDOTDIR:-$HOME}/.zshrc ${ZDOTDIR:-$HOME}/.zshenv $XDG_CONFIG_HOME/zsh/.zshrc $XDG_CONFIG_HOME/zsh/.zshenv"
        ;;
    bash)
        config_files="$HOME/.bashrc $HOME/.bash_profile $HOME/.profile $XDG_CONFIG_HOME/bash/.bashrc $XDG_CONFIG_HOME/bash/.bash_profile"
        ;;
    *)
        config_files="$HOME/.bashrc $HOME/.bash_profile"
        ;;
esac

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    config_file=""
    for file in $config_files; do
        if [[ -f $file ]]; then
            config_file=$file
            break
        fi
    done

    if [[ -z $config_file ]]; then
        echo -e "${YELLOW}Warning: No shell config file found.${NC}"
        echo "  Please add the following to your shell config manually:"
        echo "    export PATH=$INSTALL_DIR:\$PATH"
        echo "    export COSTRICT_BASE_URL=$COSTRICT_BASE_URL"
    else
        case $current_shell in
            fish)
                add_to_path "$config_file" "fish_add_path $INSTALL_DIR" "set -gx COSTRICT_BASE_URL '$COSTRICT_BASE_URL'"
                ;;
            *)
                add_to_path "$config_file" "export PATH=$INSTALL_DIR:\$PATH" "export COSTRICT_BASE_URL='$COSTRICT_BASE_URL'"
                ;;
        esac
    fi
else
    echo -e "${GREEN}✓ PATH already configured${NC}"
fi

if [ -n "${GITHUB_ACTIONS-}" ] && [ "${GITHUB_ACTIONS}" == "true" ]; then
    echo "$INSTALL_DIR" >> $GITHUB_PATH
    echo -e "${GREEN}✓ Added to GITHUB_PATH${NC}"
fi

# Run post-install verification
post_install_verify

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CoStrict CLI Installation Complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

if [[ "$ENV_UPDATED" == "1" ]]; then
    echo -e "${RED}[!] IMPORTANT: Please restart your shell for PATH changes to take effect${NC}"
    echo -e "${MUTED}    Or run: source ~/.$(basename "$SHELL")rc${NC}"
    echo ""
fi

echo -e "${MUTED}To start:${NC}"
echo ""
echo -e "cd <project>  ${MUTED}# Open directory${NC}"
echo -e "cs      ${MUTED}# Run command${NC}"
echo ""
echo -e "${MUTED}For more information visit ${NC}https://docs.costrict.ai"
echo ""
