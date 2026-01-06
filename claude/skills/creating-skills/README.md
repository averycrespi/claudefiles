# Skill Creator

Guide for creating effective Claude Code skills that extend capabilities with specialized knowledge, workflows, and tool integrations.

## What It Does

Provides structured guidance, templates, and utilities for building custom skills. Helps you transform domain expertise into reusable packages that Claude Code can leverage.

## What Are Skills?

Skills are modular packages that extend Claude's capabilities by providing:
- Specialized workflows for specific domains
- Tool integrations (file formats, APIs)
- Domain expertise (schemas, business logic)
- Bundled resources (scripts, references, assets)

## Bundled Scripts

Located in `scripts/`:
- `init_skill.py` - Initialize a new skill with proper structure
- `validate_skill.py` - Validate skill structure and metadata
- `package_skill.py` - Package skill for distribution

## Quick Start

```bash
# Initialize a new skill
scripts/init_skill.py <skill-name> --path ~/.claude/skills

# Validate skill structure
scripts/validate_skill.py ~/.claude/skills/<skill-name>

# Package for distribution
scripts/package_skill.py ~/.claude/skills/<skill-name> --output skill.zip
```

## Documentation

See [SKILL.md](SKILL.md) for complete documentation including:
- Skill anatomy and structure
- Creation process and best practices
- Progressive disclosure principles
- Advanced patterns
