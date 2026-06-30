# Changelog

All notable changes to Vouch will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-06-30

### Added
- **Authentication & State Persistence**: Added `storageState` configuration and `--storage-state` CLI flag to save and load browser auth state (cookies/localStorage), skipping repetitive UI logins in E2E tests.

## [1.3.0] - 2026-06-30

### Added
- **Temperature Decay**: AI providers now automatically lower inference temperature (e.g., 0.1 → 0.0) on Actor-Critic retries to progressively eliminate hallucination loops.
- **Inference Timing Tracking**: Detailed performance breakdown separating VLM inference latency from Playwright execution time.
- **Failure Screenshots**: Automatically saves a viewport `.png` snapshot when a step exhausts all retries (configurable via `screenshotOnFailure` and `screenshotDir`).
- **`--dry-run`**: CLI flag to quickly validate `.vch` scripts for syntax errors without launching a browser or consuming API tokens.
- **`--verbose`**: CLI flag that prints the coordinates clicked `(x, y)`, the text payload typed, the inference latency per step, and raw VLM reasoning error messages inline.
- **GitHub Actions CI** — Automated build verification and lint checks on every push/PR.
- **CHANGELOG.md** — Full release history for transparency and trust.
- **SECURITY.md** — Responsible disclosure policy.
- **CODE_OF_CONDUCT.md** — Contributor Covenant v2.1.
- Dynamic CLI version reading (no more hardcoded version strings).
- Complete documentation for `@if`/`@endif` conditional blocks.
- Documentation for `recordTrace`, `consolidateVideo`, and `traceDir` config options.
- Comparison table vs. traditional testing tools.
- npm SEO optimization (expanded keywords, homepage/bugs/funding links).
- Shields.io badges for version, license, downloads, build status, and Node.js compatibility.

### Fixed
- CLI `--version` flag now correctly reports the actual installed version (was stuck at `1.0.0`).

### Changed
- README rewritten with improved SEO structure, trust signals, and competitive positioning.
- `package.json` description optimized for npm search discoverability.
- CONTRIBUTING.md updated with CI/CD workflow information.

## [1.2.1] - 2026-06-29

### Added
- Playwright trace recording support (`recordTrace`, `traceDir` config options).
- Advanced scroll controls: absolute scrolling (to top/bottom) and pixel-based scroll amounts.
- Conditional video consolidation via FFmpeg (`consolidateVideo` option).

## [1.2.0] - 2026-06-28

### Added
- Secret masking in logs and JSON reports (API keys automatically redacted).
- Video consolidation post-processing to remove idle VLM inference frames.

### Fixed
- Improved agent navigation and hallucination handling with coordinate bounds checking.

## [1.1.0] - 2026-06-28

### Changed
- **Breaking**: Migrated from Accessibility Tree parsing to pure vision-based interaction using VLM image buffers.
- All element detection now operates exclusively via visual coordinate extraction — no DOM, no selectors, no AX Tree.

## [1.0.2] - 2026-06-28

### Added
- `doubleClick` action support for interacting with complex UI components.
- SauceDemo E2E example test (`examples/saucedemo.vch`).

### Fixed
- Refined UI element detection and optimized coordinate-based targeting for non-labeled elements.
- Hardened browser isolation for ephemeral test contexts.

## [1.0.1] - 2026-06-27

### Added
- Smart element resolution to reduce spatial prediction dependency for small local LLMs.
- Comprehensive USAGE.md guide.

### Fixed
- Test suite now aborts immediately on step failure instead of continuing silently.

## [1.0.0] - 2026-06-27

### Added
- Initial public release under `@inamul_hasan/vouch`.
- AI-powered VisionQA engine supporting OpenAI (GPT-4o), Anthropic (Claude), Google (Gemini), and Ollama (local models).
- Zero-selector browser automation via Playwright.
- `.vch` file format parser with plain English test instructions.
- Actor-Critic self-healing loop with automatic retry on validation errors.
- Interactive Daytona-style CLI with file search and guided execution.
- JSON test report generation.
- Video recording via Playwright's native context recording.
- Warm singleton browser architecture for sub-2-second step latency.
- Heavy asset blocking (images, fonts, analytics) for faster page loads.
- Early JSON stream cutoff across all providers to minimize inference latency.

[1.3.1]: https://github.com/HackX-IN/vouch/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/HackX-IN/vouch/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/HackX-IN/vouch/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/HackX-IN/vouch/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/HackX-IN/vouch/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/HackX-IN/vouch/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/HackX-IN/vouch/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/HackX-IN/vouch/releases/tag/v1.0.0
