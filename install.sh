#!/usr/bin/env bash
#
# Build IAFlow and install it into /Applications.
# Usage: ./install.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}==> IAFlow installer${NC}"

# --- 1. Node + npm check ---
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}node is not installed. Install it first (https://nodejs.org).${NC}"
  exit 1
fi

# --- 2. Install deps if needed ---
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}--> Installing dependencies (this can take a few minutes)...${NC}"
  npm install
fi

# --- 3. Build the app ---
echo -e "${YELLOW}--> Building app (vite + electron-builder)...${NC}"
npm run build

# --- 4. Locate the .app bundle (arm64 on Apple Silicon, x64 on Intel) ---
APP_PATH=""
for candidate in release/mac-arm64/IAFlow.app release/mac/IAFlow.app release/mac-x64/IAFlow.app; do
  if [ -d "$candidate" ]; then
    APP_PATH="$candidate"
    break
  fi
done

if [ -z "$APP_PATH" ]; then
  echo -e "${RED}Could not find IAFlow.app inside release/ — build may have failed.${NC}"
  ls -la release/ 2>/dev/null || true
  exit 1
fi

echo -e "${GREEN}==> Found build at $APP_PATH${NC}"

# --- 5. Quit any running instance ---
if pgrep -f "/Applications/IAFlow.app" >/dev/null 2>&1; then
  echo -e "${YELLOW}--> Quitting running IAFlow...${NC}"
  osascript -e 'tell application "IAFlow" to quit' 2>/dev/null || pkill -f "/Applications/IAFlow.app" || true
  sleep 1
fi

# --- 6. Replace in /Applications ---
DEST="/Applications/IAFlow.app"
if [ -d "$DEST" ]; then
  echo -e "${YELLOW}--> Removing previous install at $DEST${NC}"
  rm -rf "$DEST"
fi

echo -e "${YELLOW}--> Copying to /Applications...${NC}"
cp -R "$APP_PATH" "$DEST"

# --- 7. Strip quarantine attribute so first launch is clean ---
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

# --- 8. Install the headless hook CLI for local hooks/watchers ---
CLI_SRC="$SCRIPT_DIR/bin/iaflow-hook.mjs"
if [ -f "$CLI_SRC" ]; then
  chmod +x "$CLI_SRC"
  mkdir -p "$HOME/.local/bin"
  ln -sf "$CLI_SRC" "$HOME/.local/bin/iaflow-hook"
  echo -e "${GREEN}==> Installed CLI at $HOME/.local/bin/iaflow-hook${NC}"

  if [ -d "/usr/local/bin" ] && [ -w "/usr/local/bin" ]; then
    ln -sf "$CLI_SRC" "/usr/local/bin/iaflow-hook"
    echo -e "${GREEN}==> Installed CLI at /usr/local/bin/iaflow-hook${NC}"
  else
    echo -e "${YELLOW}--> Add $HOME/.local/bin to PATH if iaflow-hook is not found.${NC}"
  fi
fi

echo -e "${GREEN}==> Installed!${NC}"
echo -e "${GREEN}    Open with: open $DEST${NC}"
echo -e "${GREEN}    Or from Spotlight: ⌘Space → IAFlow${NC}"
