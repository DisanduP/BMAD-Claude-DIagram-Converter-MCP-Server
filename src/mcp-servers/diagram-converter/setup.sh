#!/bin/bash

# BMAD Diagram Converter MCP Server - Setup Script
# This script helps configure Claude Desktop to use the diagram-converter MCP server

set -e

echo "🔧 BMAD Diagram Converter MCP Server Setup"
echo "==========================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_PATH="$SCRIPT_DIR/index.js"

# Check Node.js version
echo "📦 Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v) found"

# Get full path to node (important for nvm users)
NODE_PATH=$(which node)
echo "   Node path: $NODE_PATH"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$SCRIPT_DIR"
npm install
echo "✅ Dependencies installed"

# Run tests
echo ""
echo "🧪 Running tests..."
if node test-server.js; then
    echo "✅ All tests passed"
else
    echo "⚠️  Some tests failed, but continuing..."
fi

# Detect OS and set config path
echo ""
echo "🔍 Detecting operating system..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    echo "✅ macOS detected"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_DIR="$HOME/.config/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    echo "✅ Linux detected"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    CONFIG_DIR="$APPDATA/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    echo "✅ Windows detected"
else
    echo "❌ Unknown OS: $OSTYPE"
    echo "   Please manually configure Claude Desktop."
    echo "   See SETUP.md for instructions."
    exit 1
fi

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Check if Claude Desktop is installed
echo ""
echo "🔍 Checking for Claude Desktop..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    if [ -d "/Applications/Claude.app" ]; then
        echo "✅ Claude Desktop found"
    else
        echo "⚠️  Claude Desktop not found. Install it with:"
        echo "   brew install --cask claude"
        echo "   Or download from: https://claude.ai/download"
    fi
fi

# Create or update config
echo ""
echo "📝 Configuring Claude Desktop..."

# Create the new config entry
NEW_CONFIG=$(cat <<EOF
{
  "mcpServers": {
    "diagram-converter": {
      "command": "$NODE_PATH",
      "args": ["$INDEX_PATH"]
    }
  }
}
EOF
)

if [ -f "$CONFIG_FILE" ]; then
    echo "   Existing config found at: $CONFIG_FILE"
    echo ""
    echo "   Current config:"
    cat "$CONFIG_FILE"
    echo ""
    echo ""
    read -p "   Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "$NEW_CONFIG" > "$CONFIG_FILE"
        echo "✅ Config updated"
    else
        echo "   Skipping config update."
        echo ""
        echo "   To manually add the diagram-converter, add this to your mcpServers:"
        echo ""
        echo "   \"diagram-converter\": {"
        echo "     \"command\": \"$NODE_PATH\","
        echo "     \"args\": [\"$INDEX_PATH\"]"
        echo "   }"
    fi
else
    echo "$NEW_CONFIG" > "$CONFIG_FILE"
    echo "✅ Config created at: $CONFIG_FILE"
fi

# Final instructions
echo ""
echo "==========================================="
echo "✅ Setup complete!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "1. Quit Claude Desktop completely (Cmd+Q on Mac)"
echo "2. Reopen Claude Desktop"
echo "3. Look for the 🔨 hammer icon in the chat input"
echo "4. You should see 'diagram-converter' listed"
echo ""
echo "Test it by asking Claude:"
echo "  'Convert this to Draw.io: flowchart TD A-->B-->C'"
echo ""
echo "For more info, see: $SCRIPT_DIR/SETUP.md"
