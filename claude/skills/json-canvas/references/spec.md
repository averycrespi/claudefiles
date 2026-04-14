# JSON Canvas 1.0 Specification Reference

Source: https://jsoncanvas.org/spec/1.0/ (2024-03-11)

## File Format

- **Extension:** `.canvas`
- **MIME type:** `application/json`
- **Encoding:** UTF-8 JSON

## Top-Level Structure

```json
{
  "nodes": [],
  "edges": []
}
```

Both `nodes` and `edges` are optional. An empty object `{}` is a valid canvas.

## Nodes

### Generic Node Fields (all node types)

| Field    | Required | Type    | Description                          |
|----------|----------|---------|--------------------------------------|
| `id`     | yes      | string  | Unique identifier                    |
| `type`   | yes      | string  | `"text"`, `"file"`, `"link"`, `"group"` |
| `x`      | yes      | integer | X position in pixels (top-left)      |
| `y`      | yes      | integer | Y position in pixels (top-left)      |
| `width`  | yes      | integer | Width in pixels                      |
| `height` | yes      | integer | Height in pixels                     |
| `color`  | no       | string  | `canvasColor` — hex or preset        |

### Text Node (`type: "text"`)

| Field  | Required | Type   | Description                     |
|--------|----------|--------|---------------------------------|
| `text` | yes      | string | Plain text with Markdown syntax |

### File Node (`type: "file"`)

| Field     | Required | Type   | Description                              |
|-----------|----------|--------|------------------------------------------|
| `file`    | yes      | string | Path to file (relative to vault/system)  |
| `subpath` | no       | string | Link to heading or block; starts with `#` |

### Link Node (`type: "link"`)

| Field | Required | Type   | Description |
|-------|----------|--------|-------------|
| `url` | yes      | string | URL         |

### Group Node (`type: "group"`)

| Field             | Required | Type   | Description                       |
|-------------------|----------|--------|-----------------------------------|
| `label`           | no       | string | Text label for the group          |
| `background`      | no       | string | Path to background image          |
| `backgroundStyle` | no       | string | `"cover"`, `"ratio"`, or `"repeat"` |

**`backgroundStyle` values:**

| Value      | Behavior                                           |
|------------|----------------------------------------------------|
| `"cover"`  | Fills entire node width and height                 |
| `"ratio"`  | Maintains aspect ratio of background image         |
| `"repeat"` | Repeats image as a pattern in both x and y         |

### Node Z-Ordering

Nodes are stored in ascending z-index order. First node in the array renders at the bottom; last renders on top. There is no explicit z-index field.

## Edges

| Field      | Required | Type   | Description                              |
|------------|----------|--------|------------------------------------------|
| `id`       | yes      | string | Unique identifier                        |
| `fromNode` | yes      | string | ID of the source node                    |
| `fromSide` | no       | string | Side of source node: `"top"`, `"right"`, `"bottom"`, `"left"` |
| `fromEnd`  | no       | string | Endpoint shape at start. Default: `"none"` |
| `toNode`   | yes      | string | ID of the target node                    |
| `toSide`   | no       | string | Side of target node: `"top"`, `"right"`, `"bottom"`, `"left"` |
| `toEnd`    | no       | string | Endpoint shape at end. Default: `"arrow"` |
| `color`    | no       | string | `canvasColor` — hex or preset            |
| `label`    | no       | string | Text label displayed on the edge         |

**Endpoint shapes (`fromEnd` / `toEnd`):**

| Value     | Meaning    |
|-----------|------------|
| `"none"`  | No arrow   |
| `"arrow"` | Arrowhead  |

Default behavior with no explicit ends: one-directional arrow from source to target (`fromEnd: "none"`, `toEnd: "arrow"`).

## Colors (`canvasColor`)

A string in one of two forms:

**Hex color:** Standard hex string, e.g., `"#FF0000"`.

**Preset number:** `"1"` through `"6"`, mapped to semantic colors:

| Value | Color  |
|-------|--------|
| `"1"` | Red    |
| `"2"` | Orange |
| `"3"` | Yellow |
| `"4"` | Green  |
| `"5"` | Cyan   |
| `"6"` | Purple |

Preset colors do not have defined hex values — applications choose their own rendering.

## Enums Summary

| Enum             | Context                        | Values                                         |
|------------------|--------------------------------|-------------------------------------------------|
| Node type        | `type` on nodes                | `"text"`, `"file"`, `"link"`, `"group"`        |
| Side             | `fromSide`, `toSide` on edges | `"top"`, `"right"`, `"bottom"`, `"left"`       |
| End shape        | `fromEnd`, `toEnd` on edges   | `"none"`, `"arrow"`                             |
| Background style | `backgroundStyle` on groups   | `"cover"`, `"ratio"`, `"repeat"`               |
| Preset color     | `color` on nodes/edges         | `"1"`, `"2"`, `"3"`, `"4"`, `"5"`, `"6"`     |

## TypeScript Types (from Obsidian API)

```typescript
type CanvasColor = string;

interface CanvasData {
  nodes: AllCanvasNodeData[];
  edges: CanvasEdgeData[];
  [key: string]: any;
}

interface CanvasNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  [key: string]: any;
}

type AllCanvasNodeData =
  | CanvasFileData
  | CanvasTextData
  | CanvasLinkData
  | CanvasGroupData;

interface CanvasFileData extends CanvasNodeData {
  type: "file";
  file: string;
  subpath?: string;
}

interface CanvasTextData extends CanvasNodeData {
  type: "text";
  text: string;
}

interface CanvasLinkData extends CanvasNodeData {
  type: "link";
  url: string;
}

interface CanvasGroupData extends CanvasNodeData {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

type NodeSide = "top" | "right" | "bottom" | "left";
type EdgeEnd = "none" | "arrow";

interface CanvasEdgeData {
  id: string;
  fromNode: string;
  fromSide?: NodeSide;
  fromEnd?: EdgeEnd;
  toNode: string;
  toSide?: NodeSide;
  toEnd?: EdgeEnd;
  color?: CanvasColor;
  label?: string;
  [key: string]: any;
}
```

Note: `[key: string]: any` on interfaces allows forward-compatible extra properties.

## Validation Rules

1. All `id` fields must be unique across the entire canvas
2. Edge `fromNode` and `toNode` must reference existing node IDs
3. `x`, `y`, `width`, `height` must be integers
4. `color` must be a hex string or `"1"`–`"6"` if present
5. File node `subpath` must start with `#` if present
6. `backgroundStyle` must be `"cover"`, `"ratio"`, or `"repeat"` if present
7. `fromSide`/`toSide` must be `"top"`, `"right"`, `"bottom"`, or `"left"` if present
8. `fromEnd`/`toEnd` must be `"none"` or `"arrow"` if present

## Example Canvas

```json
{
  "nodes": [
    {
      "id": "754a8ef995f366bc",
      "type": "group",
      "x": -300,
      "y": -460,
      "width": 610,
      "height": 200,
      "label": "JSON Canvas"
    },
    {
      "id": "8132d4d894c80022",
      "type": "file",
      "file": "readme.md",
      "x": -280,
      "y": -200,
      "width": 570,
      "height": 560,
      "color": "6"
    },
    {
      "id": "7efdbbe0c4742315",
      "type": "file",
      "file": "_site/logo.svg",
      "x": -280,
      "y": -440,
      "width": 217,
      "height": 80
    },
    {
      "id": "59e896bc8da20699",
      "type": "text",
      "text": "Learn more:\n\n- [Apps](/docs/apps.md)\n- [Spec](spec/1.0.md)\n- [Github](https://github.com/obsidianmd/jsoncanvas)",
      "x": 40,
      "y": -440,
      "width": 250,
      "height": 160
    },
    {
      "id": "0ba565e7f30e0652",
      "type": "file",
      "file": "spec/1.0.md",
      "x": 360,
      "y": -400,
      "width": 400,
      "height": 400
    }
  ],
  "edges": [
    {
      "id": "6fa11ab87f90b8af",
      "fromNode": "7efdbbe0c4742315",
      "fromSide": "right",
      "toNode": "59e896bc8da20699",
      "toSide": "left"
    }
  ]
}
```
