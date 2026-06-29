import * as fs from "node:fs";
import * as path from "node:path";

import type { VouchConfig } from "../types/index.js";

export function generateJSONReport(
  result: any,
  reportDir: string,
  config?: VouchConfig,
): string {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `vouch-report-${timestamp}.json`;
  const filePath = path.join(reportDir, filename);

  let reportData = JSON.stringify(result, null, 2);

  if (config?.apiKey && config.apiKey.trim().length > 0) {
    reportData = reportData.split(config.apiKey).join("***MASKED***");
  }

  fs.writeFileSync(filePath, reportData, "utf-8");
  return filePath;
}
