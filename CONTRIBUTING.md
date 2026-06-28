# Contributing to Vouch

First off, thank you for considering contributing to Vouch! It's people like you that make Vouch such a great tool for vision-driven automation.

## Where do I go from here?

If you've noticed a bug or have a feature request, make sure to check our [Issues](https://github.com/HackX-IN/vouch/issues) first to see if someone else has already created a ticket. If not, go ahead and create one!

## Fork & create a branch

If this is something you think you can fix, then fork Vouch and create a branch with a descriptive name.

## Local Development

1. Clone your fork: \`git clone https://github.com/YOUR_USERNAME/vouch.git\`
2. Install dependencies: \`npm install\` or \`bun install\`
3. Create a \`vouch.config.json\` file with your preferred AI provider settings.
4. Run the project in development mode: \`npm run dev\`
5. Test your changes by running example tests: \`npm start run examples/demo.vch\`

## Guidelines

- Keep it blazing fast. Vouch is designed for low latency. Ensure new features do not slow down the critical Actor-Critic loop.
- Avoid CSS selectors and DOM queries. Vouch operates exclusively via the Chrome Accessibility Tree.
- Format code using Prettier and ensure \`npm run lint\` passes without errors.

## Pull Requests

When you're ready to submit a Pull Request, please provide a clear description of the changes you've made, why you made them, and how they can be tested. We will review your PR as soon as possible!
