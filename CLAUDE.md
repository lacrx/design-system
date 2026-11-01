# Design System

Cross-project design token infrastructure. Provides build pipeline, lint configs, templates, and scaffold CLI.

## Architecture
- `build/` - Style Dictionary config and build script
- `lint/` - Shareable Stylelint config (bans hardcoded values)
- `schema/` - JSON Schema for token file validation
- `templates/` - Files scaffolded into consuming projects via `init`
- `bin/cli.js` - CLI entry point (`init` and `build` commands)
- `examples/` - Reference token sets (minimal and full)

## Token Format
W3C DTCG (Design Tokens Community Group) JSON with `$value`, `$type`, `$description` fields. Three layers: primitives (raw values), semantic (role references), components (optional overrides).

## Commands
- `design-system init` - scaffold tokens, DESIGN.md, lint config into a project
- `design-system build` - compile tokens/ to dist/tokens.css in the current project

## Rules
- Never put visual style choices in this repo. It provides infrastructure only.
- Token files use DTCG format exclusively.
- All CSS output uses `outputReferences: true` so semantic tokens reference primitives via `var()`.
