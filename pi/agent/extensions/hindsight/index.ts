import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerConfigCommand } from "../_shared/config.ts";
import { HindsightClient } from "./client.ts";
import { DEFAULT_HINDSIGHT_CONFIG, loadHindsightConfig } from "./config.ts";
import { registerHindsightDoctorCommand } from "./doctor.ts";
import { registerHindsightTool } from "./tools.ts";

export default function (pi: ExtensionAPI) {
  const client = new HindsightClient(DEFAULT_HINDSIGHT_CONFIG);

  registerHindsightTool(pi, { client, loadConfig: loadHindsightConfig });
  registerHindsightDoctorCommand(pi, {
    client,
    loadConfig: loadHindsightConfig,
  });
  registerConfigCommand(pi, {
    extensionName: "hindsight",
    loadConfig: loadHindsightConfig,
    sensitiveFields: ["apiKey"],
  });
}
