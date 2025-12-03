# BMAD Diagram Converter MCP Server

Convert Mermaid diagrams to Draw.io XML format using the Model Context Protocol (MCP).

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/DisanduP/BMAD-Charts-Agent.git
cd BMAD-Charts-Agent/src/mcp-servers/diagram-converter

# Run automated setup (configures Claude Desktop automatically)
./setup.sh
```

Or see [SETUP.md](./SETUP.md) for detailed manual instructions.

## Features

- 🔄 **Convert Flowcharts** - Mermaid flowcharts to Draw.io XML
- 🗃️ **Convert ER Diagrams** - Entity-relationship diagrams with proper layout
- 🔀 **Convert Sequence Diagrams** - Message flows with lifelines
- 📦 **Convert Class Diagrams** - UML class diagrams with methods and relationships
- 🧠 **Convert Mindmaps** - Hierarchical mindmaps
- 🌳 **Convert Git Graphs** - Git branch visualizations
- 📝 **Generate Documentation** - Mermaid to structured Markdown
- ✅ **Validate Syntax** - Check diagrams before conversion
- 📖 **Conversion Rules** - Built-in ruleset reference

## Installation

### Option 1: From this repository

```bash
cd src/mcp-servers/diagram-converter
npm install
```

### Option 2: Global install (after publishing)

```bash
npm install -g @bmad/diagram-converter-mcp
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "diagram-converter": {
      "command": "node",
      "args": ["/absolute/path/to/src/mcp-servers/diagram-converter/index.js"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "diagram-converter": {
      "command": "diagram-converter-mcp"
    }
  }
}
```

Then restart Claude Desktop.

## Usage with Other MCP Clients

### Cline (VS Code)

Add to your Cline MCP settings:

```json
{
  "diagram-converter": {
    "command": "node",
    "args": ["/path/to/src/mcp-servers/diagram-converter/index.js"]
  }
}
```

### Continue.dev

Add to your Continue configuration:

```json
{
  "mcpServers": [
    {
      "name": "diagram-converter",
      "command": "node",
      "args": ["/path/to/src/mcp-servers/diagram-converter/index.js"]
    }
  ]
}
```

## Available Tools

Once connected, you'll have access to these tools:

### `convert_mermaid_to_drawio`

Convert Mermaid to Draw.io XML.

```
Input:
- mermaidCode: string (required) - The Mermaid diagram code
- diagramType: "flowchart" | "erDiagram" | "auto" (optional)

Output: Draw.io XML ready for import
```

**Example:**
```
Convert this flowchart to Draw.io:

flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process]
    B -->|No| D[End]
```

### `convert_mermaid_to_markdown`

Generate structured documentation from a Mermaid diagram.

```
Input:
- mermaidCode: string (required)

Output: Markdown documentation with nodes, relationships, and original code
```

### `validate_mermaid`

Check diagram syntax and conversion compatibility.

```
Input:
- mermaidCode: string (required)

Output: Validation status, issues, and suggestions
```

### `get_conversion_rules`

Get the conversion ruleset and best practices.

```
Input:
- diagramType: "flowchart" | "erDiagram" | "general" (optional)

Output: Detailed rules for the specified diagram type
```

## Available Prompts

### `diagram-converter-agent`

Loads the full Mira agent persona for interactive, menu-driven conversion.

```
Arguments:
- userName: string (optional) - Your name for personalized greetings
```

## Example Workflow

1. **Validate first:**
   ```
   Please validate this Mermaid diagram:
   
   erDiagram
       USER ||--o{ ORDER : places
       ORDER ||--|{ LINE_ITEM : contains
   ```

2. **Convert to Draw.io:**
   ```
   Now convert it to Draw.io XML
   ```

3. **Import to Draw.io:**
   - Copy the XML output
   - Go to [draw.io](https://app.diagrams.net)
   - File → Import From → Text
   - Paste and import

## Supported Diagram Types

| Type | Status | Notes |
|------|--------|-------|
| Flowchart | ✅ Full | With auto Start/End nodes |
| ER Diagram | ✅ Full | Grid layout, corridor routing |
| Sequence | ✅ Full | Participants, messages, notes |
| Class | ✅ Full | Classes, methods, relationships |
| Mindmap | ✅ Full | Radial layout, multiple levels |
| Git Graph | ✅ Full | Branches, commits, merges, tags |

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run normally
npm start
```

## Testing the Server

You can test the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node index.js
```

## Troubleshooting

### Server not appearing in Claude Desktop

1. Check the path in `claude_desktop_config.json` is absolute
2. Ensure Node.js 18+ is installed
3. Restart Claude Desktop completely
4. Check Claude Desktop logs for errors

### Conversion output looks wrong

1. Use `validate_mermaid` first to check syntax
2. Use `get_conversion_rules` to see supported syntax
3. Simplify complex diagrams

### "Unsupported diagram type" error

Currently only `flowchart` and `erDiagram` are fully supported. Other types coming soon!

## License

MIT
