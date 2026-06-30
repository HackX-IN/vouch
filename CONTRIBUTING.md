# Contributing to Vouch

First off, thank you for considering contributing to Vouch! It's people like you that make Vouch such a great tool for vision-driven automation.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Where Do I Go From Here?

If you've noticed a bug or have a feature request, check our [Issues](https://github.com/HackX-IN/vouch/issues) first to see if someone else has already created a ticket. If not, go ahead and [create one](https://github.com/HackX-IN/vouch/issues/new)!

## Fork & Create a Branch

If this is something you think you can fix, then fork Vouch and create a branch with a descriptive name.

```bash
git checkout -b fix/coordinate-resolution-bug
```

## Local Development

1. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/vouch.git
   cd vouch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Create a `vouch.config.json`** with your preferred AI provider settings.

4. **Run the project in development mode:**
   ```bash
   npm run dev
   ```

5. **Test your changes** by running example tests:
   ```bash
   npm start run examples/demo.vch
   ```

## Guidelines

- **Keep it blazing fast.** Vouch is designed for low latency. Ensure new features do not slow down the critical Actor-Critic loop.
- **No selectors.** Avoid CSS selectors, DOM queries, and Accessibility Trees. Vouch operates exclusively via pure vision-canvas rendering with VLMs.
- **Type safety.** All code must pass `npm run lint` (TypeScript strict mode) without errors.
- **Format code** using Prettier and ensure `npm run lint` passes.

## CI/CD

Every push and pull request triggers the [CI workflow](https://github.com/HackX-IN/vouch/actions/workflows/ci.yml) which:

1. Runs TypeScript type-checking (`npm run lint`)
2. Builds the project (`npm run build`)
3. Verifies the CLI binary outputs exist and are executable
4. Tests across Node.js 18, 20, and 22

Make sure your changes pass CI before requesting review.

## Pull Requests

When you're ready to submit a Pull Request, please:

1. **Fill out the PR template** with a clear description of changes
2. **Explain why** you made the changes, not just what
3. **Include test instructions** so reviewers can verify your work
4. **Ensure CI passes** on all Node.js versions

We will review your PR as soon as possible!

## Commit Convention

We use conventional commits:

```
feat: add new scroll direction support
fix: resolve coordinate overflow on small viewports
docs: update configuration reference
chore: bump playwright to 1.62
refactor: simplify base provider response parsing
```

## Reporting Security Issues

Please do **not** open GitHub issues for security vulnerabilities. See our [Security Policy](SECURITY.md) for responsible disclosure.
