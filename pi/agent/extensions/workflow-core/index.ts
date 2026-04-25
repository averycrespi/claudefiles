import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// workflow-core registers no commands of its own. Sibling extensions
// (autopilot, autoralph, etc.) consume its primitives via api.ts.
export default function (_pi: ExtensionAPI): void {}
