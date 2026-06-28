import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_CONFIG } from "../types/index.js";

export async function initProject(quiet = false) {
  let chalk: typeof import("chalk") | undefined = undefined;
  let figures: typeof import("figures") | undefined = undefined;
  let p: typeof import("@clack/prompts") | null = null;

  try {
    chalk = await import("chalk");
    figures = await import("figures");
    if (!quiet) {
      p = await import("@clack/prompts");
    }
  } catch (e) {
    // fallback if dependencies missing in strange environments
  }

  const c: any = chalk?.default ?? chalk;
  const f: any = figures?.default ?? figures;

  const configContent = JSON.stringify(DEFAULT_CONFIG, null, 2);

  if (!fs.existsSync("vouch.config.json")) {
    fs.writeFileSync("vouch.config.json", configContent, "utf-8");
    if (p) p.log.success("Created vouch.config.json");
    else if (!quiet && c && f)
      console.log(c.green(`  ${f.tick} Created vouch.config.json`));
  } else {
    if (!quiet && c && f)
      console.log(
        c.yellow(`  ${f.warning} vouch.config.json already exists, skipping.`),
      );
  }

  const exampleDir = "examples";
  if (!fs.existsSync(exampleDir)) {
    fs.mkdirSync(exampleDir, { recursive: true });
  }

  const exampleTest = `> name: Example Login Flow\n# This is an example Vouch test file\n\n@navigate https://example.com/login\n\nclick on the email input field\ntype test@example.com into the email field\nclick on the password input field\ntype SecurePassword123! into the password field\n\nclick the Sign In button\n\n@assert Dashboard heading is visible\n`;
  const examplePath = path.join(exampleDir, "demo.vch");
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, exampleTest, "utf-8");
    if (p) p.log.success(`Created ${examplePath}`);
    else if (!quiet && c && f)
      console.log(c.green(`  ${f.tick} Created ${examplePath}`));
  }
}
