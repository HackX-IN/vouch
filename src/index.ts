import { createCLI } from "./cli/commands.js";

/**
 * ⚡ Vouch — Zero-selector, vision-driven web and desktop automation.
 *
 * Entry point for the CLI binary.
 */
async function main() {
  const program = createCLI();
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
