# Diagram Converter MCP Server - Setup Guide

A Model Context Protocol (MCP) server that converts Mermaid diagrams to Draw.io XML format, enabling seamless diagram conversion within Claude Desktop.

## 📋 Prerequisites

- **Node.js 18+** (Required)
- **Claude Desktop** (macOS/Windows)
- **Git** (to clone the repo)

## 🚀 Quick Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/DisanduP/BMAD-Charts-Agent.git
cd BMAD-Charts-Agent
```

### Step 2: Install Dependencies

```bash
cd src/mcp-servers/diagram-converter
npm install
```

### Step 3: Verify Installation

```bash
node test-server.js
```

You should see all tests passing:
```
✅ All type detection tests passed!
```

### Step 4: Install Claude Desktop

#### macOS
```bash
brew install --cask claude
```

#### Windows
Download from: https://claude.ai/download

#### Linux
Download the AppImage from: https://claude.ai/download

### Step 5: Configure Claude Desktop

#### macOS

Create/edit the config file:
```bash
mkdir -p ~/Library/Application\ Support/Claude
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Add the following (replace `YOUR_USERNAME` and update the path):
```json
{
  "mcpServers": {
    "diagram-converter": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/path/to/BMAD-Charts-Agent/src/mcp-servers/diagram-converter/index.js"]
    }
  }
}
```

**⚠️ Important for NVM users:** If you use nvm, use the full path to node:
```json
{
  "mcpServers": {
    "diagram-converter": {
      "command": "/Users/YOUR_USERNAME/.nvm/versions/node/v20.x.x/bin/node",
      "args": ["/Users/YOUR_USERNAME/path/to/BMAD-Charts-Agent/src/mcp-servers/diagram-converter/index.js"]
    }
  }
}
```

Find your node path with: `which node`

#### Windows

Create/edit: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-converter": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\path\\to\\BMAD-Charts-Agent\\src\\mcp-servers\\diagram-converter\\index.js"]
    }
  }
}
```

#### Linux

Create/edit: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-converter": {
      "command": "node",
      "args": ["/home/YOUR_USERNAME/path/to/BMAD-Charts-Agent/src/mcp-servers/diagram-converter/index.js"]
    }
  }
}
```

### Step 6: Restart Claude Desktop

**Completely quit** Claude Desktop (Cmd+Q on Mac, or right-click system tray → Quit on Windows), then reopen it.

### Step 7: Verify MCP Server is Connected

1. Open Claude Desktop
2. Look for the **hammer icon** 🔨 or **tools button** in the chat input area
3. You should see "diagram-converter" listed

## 🎯 Usage

Simply ask Claude to convert your Mermaid diagrams:

### Example Prompts

**Flowchart:**
```
Convert this to Draw.io:

flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process]
    B -->|No| D[End]
```

**ER Diagram:**
```
Convert this ER diagram to Draw.io:

erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    PRODUCT ||--o{ LINE-ITEM : "ordered in"
```

**Sequence Diagram:**
```
Convert to Draw.io:

sequenceDiagram
    Alice->>Bob: Hello Bob!
    Bob-->>Alice: Hi Alice!
```

**Class Diagram:**
```
Convert this class diagram:

classDiagram
    class Animal {
        +String name
        +makeSound()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog
```

**Mindmap:**
```
Convert this mindmap to Draw.io:

mindmap
    root((Project))
        Planning
            Research
            Design
        Development
            Frontend
            Backend
```

**Git Graph:**
```
Convert this git graph:

gitGraph
    commit
    branch develop
    checkout develop
    commit
    checkout main
    merge develop
```

## 🛠️ Available Tools

The MCP server provides these tools:

| Tool | Description |
|------|-------------|
| `convert_mermaid_to_drawio` | Convert Mermaid to Draw.io XML |
| `convert_mermaid_to_markdown` | Convert Mermaid to structured Markdown documentation |
| `validate_mermaid` | Validate Mermaid syntax |
| `get_conversion_rules` | Get conversion ruleset and best practices |

## 📊 Supported Diagram Types

- ✅ Flowcharts (`flowchart TD/LR/BT/RL`)
- ✅ ER Diagrams (`erDiagram`)
- ✅ Sequence Diagrams (`sequenceDiagram`)
- ✅ Class Diagrams (`classDiagram`)
- ✅ Mindmaps (`mindmap`)
- ✅ Git Graphs (`gitGraph`)

## 🔧 Troubleshooting

### MCP Server not showing in Claude Desktop

1. **Check Node version:**
   ```bash
   node -v
   ```
   Must be 18.0.0 or higher.

2. **Check config file syntax:**
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
   ```
   Should output valid JSON without errors.

3. **Check file paths:**
   Make sure the path to `index.js` is correct and absolute.

4. **Check logs:**
   ```bash
   # macOS
   cat ~/Library/Logs/Claude/mcp-server-diagram-converter.log
   
   # Windows
   type %APPDATA%\Claude\Logs\mcp-server-diagram-converter.log
   ```

5. **NVM users:** Claude Desktop doesn't inherit shell config. Use full path to node:
   ```bash
   which node
   # Use this full path in the config
   ```

### Server crashes immediately

1. Test the server manually:
   ```bash
   cd src/mcp-servers/diagram-converter
   node index.js
   ```
   
2. If you see errors, run:
   ```bash
   npm install
   ```

### Conversion produces incorrect output

1. Use the validate tool first:
   ```
   Validate this Mermaid diagram: [your diagram]
   ```

2. Make sure your Mermaid syntax is correct by testing at: https://mermaid.live

## 📁 Project Structure

```
src/mcp-servers/diagram-converter/
├── index.js          # Main MCP server
├── package.json      # Dependencies
├── test-server.js    # Test script
├── README.md         # Technical documentation
└── SETUP.md          # This file
```

## 🔄 Updating

To update to the latest version:

```bash
cd BMAD-Charts-Agent
git pull origin main
cd src/mcp-servers/diagram-converter
npm install
```

Then restart Claude Desktop.

## 📝 Using the Output

After Claude generates the Draw.io XML:

1. **Copy the XML** (everything from `<?xml` to `</mxfile>`)
2. Go to **draw.io** (https://app.diagrams.net)
3. Select **File → Import From → Text**
4. Paste the XML and click **Import**
5. Your diagram will appear!

Alternatively, save the XML as a `.drawio` file and open it directly.

## 🤝 Support

If you encounter issues:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Check the logs for error messages
3. Open an issue on GitHub

## 📄 License

MIT License - see LICENSE file for details.
