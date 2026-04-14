---
name: json-canvas
description: Use when creating, reading, modifying, or validating JSON Canvas (.canvas) files — the open format for infinite canvas data used by Obsidian and other tools.
---

# JSON Canvas

Create, read, modify, and validate `.canvas` files conforming to the [JSON Canvas 1.0 spec](https://jsoncanvas.org/spec/1.0/).

## When to Use

- User asks to create a canvas, diagram, flowchart, mind map, or knowledge graph as a `.canvas` file
- User asks to read, parse, modify, or validate an existing `.canvas` file
- User references JSON Canvas, `.canvas` files, or Obsidian canvas

## Spec Quick Reference

Full spec details: [references/spec.md](references/spec.md)

A `.canvas` file is JSON with two optional arrays:

```json
{ "nodes": [...], "edges": [...] }
```

**Node types:** `text`, `file`, `link`, `group`. All nodes require `id`, `type`, `x`, `y`, `width`, `height` (integers).

**Edges** require `id`, `fromNode`, `toNode`. Optional: `fromSide`/`toSide`, `fromEnd`/`toEnd` (defaults: `"none"` / `"arrow"`), `color`, `label`.

**Colors:** hex string (`"#FF0000"`) or preset `"1"`–`"6"` (red, orange, yellow, green, cyan, purple).

## Rules

### IDs
- Generate unique IDs as 16-character lowercase hex strings (e.g., `"a1b2c3d4e5f67890"`)
- Never duplicate an ID within a canvas

### Node Ordering
- Node array order = z-index. First node renders at bottom, last at top.
- Place group nodes before their contained nodes so groups render behind content.

### Layout
- Coordinate system: positive x = right, positive y = down (Obsidian convention)
- `x`, `y` refer to the top-left corner of the node
- Default node size: 250w x 60h for text, 400w x 400h for file/link, sized to fit for groups
- Space nodes with at least 20px gaps to avoid overlap
- For automatic layouts, use one of these strategies:
  - **Grid:** equal spacing, left-to-right then top-to-bottom
  - **Tree/flowchart:** root at top, children below with even horizontal distribution
  - **Force-directed:** for interconnected graphs, spread nodes evenly

### Text Content
- Text node `text` field supports Markdown syntax
- Use Markdown for rich content: headings, lists, bold, links, code blocks

### Groups
- Groups contain nodes spatially — any node whose bounds fall within the group's bounds is considered inside it
- No explicit parent-child field exists; containment is purely geometric
- Set group position and size to encompass all child nodes with padding (typically 20-40px)

### Edges
- `fromNode` and `toNode` must reference valid node IDs
- Omitting `fromEnd`/`toEnd` produces a standard directed arrow (no tail, arrow head)
- For bidirectional edges, set both `fromEnd` and `toEnd` to `"arrow"`
- For undirected edges, set both to `"none"`

### Forward Compatibility
- Preserve unknown properties when modifying existing canvas files
- Do not strip extra keys from nodes or edges

### Validation Checklist
When creating or modifying a canvas, verify:
1. All node and edge IDs are unique
2. All edge `fromNode`/`toNode` reference existing node IDs
3. `x`, `y`, `width`, `height` are integers (not floats)
4. Colors are valid (hex string or `"1"`–`"6"`)
5. File node `subpath` starts with `#` if present
6. Group nodes appear before their contained nodes in the array
