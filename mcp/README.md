# Studio MCP Server

MCP (Model Context Protocol) server for Studio IA - AI Video Production Platform.

## Installation

```bash
cd mcp
npm install
npm run build
```

## Configuration

Add to your Claude Code settings (`~/.claude/claude_code_config.json`):

```json
{
  "mcpServers": {
    "studio": {
      "command": "node",
      "args": ["/path/to/studio/mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

Or for development with tsx:

```json
{
  "mcpServers": {
    "studio": {
      "command": "npx",
      "args": ["tsx", "/path/to/studio/mcp/src/index.ts"],
      "env": {
        "SUPABASE_URL": "your-supabase-url",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

## Available Tools

### Bible Management

| Tool | Description |
|------|-------------|
| `add_character` | Add a character to the project Bible |
| `update_character` | Update an existing character |
| `delete_character` | Delete a character |
| `list_characters` | List all characters in project |
| `add_location` | Add a location to the Bible |
| `update_location` | Update a location |
| `delete_location` | Delete a location |
| `list_locations` | List all locations |
| `add_prop` | Add a prop/accessory |
| `delete_prop` | Delete a prop |

### Script Management

| Tool | Description |
|------|-------------|
| `add_scene` | Add a new scene |
| `update_scene` | Update scene metadata |
| `delete_scene` | Delete a scene and contents |
| `list_scenes` | List all scenes |
| `add_dialogue` | Add dialogue to a scene |
| `add_action` | Add action/description |
| `add_transition` | Add transition (CUT TO, etc.) |
| `update_script_element` | Update any script element |
| `delete_script_element` | Delete a script element |
| `list_script_elements` | List elements in a scene |

### Shot Management

| Tool | Description |
|------|-------------|
| `add_shot` | Add a shot to a scene |
| `update_shot` | Update shot details |
| `delete_shot` | Delete a shot |

### Project Info

| Tool | Description |
|------|-------------|
| `get_project` | Get project details |
| `get_full_script` | Get complete script in Fountain format |

## Usage Examples

### Adding a character

```
User: Ajoute Noah à la bible du projet d191400d-acbd-4ff4-885b-3f740af99d96

Claude will call: add_character({
  project_id: "d191400d-acbd-4ff4-885b-3f740af99d96",
  name: "NOAH",
  description: "Leader du groupe YouTube",
  visual_description: "Young charismatic man in his twenties"
})
```

### Adding a scene with dialogue

```
User: Crée une scène dans un café où Marie rencontre Paul

Claude will call:
1. add_scene({ project_id: "...", location: "CAFÉ", int_ext: "INT", time_of_day: "JOUR" })
2. add_action({ scene_id: "...", content: "Marie entre dans le café bondé..." })
3. add_dialogue({ scene_id: "...", character_name: "MARIE", content: "Paul ?" })
```

## Development

```bash
# Watch mode
npm run dev

# Build
npm run build

# Run built version
npm start
```
