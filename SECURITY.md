# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.3.x   | ✅ Active support  |
| 1.2.x   | ⚠️ Security fixes only |
| < 1.2   | ❌ End of life     |

## Reporting a Vulnerability

We take the security of Vouch seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email your findings to: **security@vouch.dev** (or open a [private security advisory](https://github.com/HackX-IN/vouch/security/advisories/new) on GitHub).
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment** within 48 hours of your report.
- **Assessment** within 5 business days.
- **Fix timeline** communicated once the issue is confirmed.
- **Credit** given in the release notes (unless you prefer to remain anonymous).

## Security Best Practices for Users

### API Key Management

Vouch handles API keys for AI providers. Follow these practices:

- **Never commit** `vouch.config.json` to version control (it's in `.gitignore` by default).
- Use **environment variables** (`VOUCH_API_KEY`) instead of config file values for CI/CD.
- Vouch automatically **masks API keys** in all logs and JSON reports.

### Local Model Option

For maximum security, use **Ollama** as your AI provider. This keeps all test data and screenshots on your local machine — nothing is sent to external APIs.

```json
{
  "provider": "ollama",
  "model": "qwen3-vl:2b-instruct"
}
```

### Network Security

- Vouch validates all navigation URLs and blocks known SSRF targets (e.g., AWS metadata endpoints).
- Only `http:` and `https:` protocols are permitted.
- Heavy asset blocking prevents loading of third-party analytics and tracking scripts during test execution.

## Dependencies

Vouch's dependencies are regularly audited. Run `npm audit` to check for known vulnerabilities in the dependency tree.
