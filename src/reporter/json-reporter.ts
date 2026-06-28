import * as fs from "node:fs";
import * as path from "node:path";
import type { TestRunResult } from "../types/index";

export function generateJSONReport(result: TestRunResult, reportDir: string): string {
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `vouch-report-${timestamp}.json`;
  const filePath = path.join(reportDir, filename);

  const reportData = JSON.stringify(result, null, 2);
  
  fs.writeFileSync(filePath, reportData, "utf-8");
  return filePath;
}
