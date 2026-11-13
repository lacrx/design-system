# Design System

Cross-project design token infrastructure. Provides build pipeline, lint config, token validator, and scaffold CLI.

## Architecture
- `build/` - Style Dictionary config and build script
- `lint/` - Shareable Stylelint config (bans hardcoded values)
- `schema/` - `tokens.schema.json` (DTCG structure, JSON Schema 2020-12) and `validate.js` (schema check plus cross-file reference resolution)
- `templates/` - Files scaffolded into consuming projects via `init`
- `bin/cli.js` - CLI entry point (`init`, `build`, `validate`)
- `examples/` - Reference token sets (minimal and full)
- `test/` - `node --test` suite; covers build, CLI, validator, scaffold, and the lint config

## Token Format
W3C DTCG (Design Tokens Community Group) JSON with `$value`, `$type`, `$description` fields. Three layers: primitives (raw values), semantic (role references), components (optional overrides). `$type` inherits from the nearest ancestor group; a pure alias takes its target's type.

## Commands
- `design-system init` - scaffold tokens, DESIGN.md, lint config, scripts, and the devDependency into a project
- `design-system build` - compile tokens/ to dist/tokens.css in the current project
- `design-system validate` - schema-check token files and resolve every reference
- `npm test` - run the suite

## Rules
- Never put visual style choices in this repo. It provides infrastructure only.
- Token files use DTCG format exclusively.
- All CSS output uses `outputReferences: true` so semantic tokens reference primitives via `var()`.
- `build/` and `schema/` are exported as library APIs via `index.js`, so they throw; only `bin/cli.js` sets an exit code.
- The lint property list and `templates/claude-md-design.md` are two halves of one contract. Change one, change the other, and cover it in `test/lint.test.js`.

## Peer dependencies
Stylelint and `stylelint-declaration-strict-value` are optional peers, so a consumer installing this package gets neither. `bin/init.js` adds them to the consuming project itself, with ranges derived from our own `peerDependencies`, so a scaffolded project can lint without anything installed by hand. `test/init.test.js` asserts every peer is wired.

## Not on npm
Installed from GitHub (`github:lacrx/design-system`). `bin/init.js` writes that spec into the consuming project's devDependencies; if the package is ever published, change `PACKAGE_SPEC` there.

## Stylelint plugin gotchas
`stylelint-declaration-strict-value` v1.10.x documents regex keys for the `ignoreValues` and `ignoreFunctions` hashes, but they never match; use a flat array or exact property keys. Custom messages interpolate `${property}`, `${value}` and `${types}`, not `{{ property }}`.
