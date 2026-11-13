# Design System

Cross-project design token infrastructure. Provides build pipeline, lint config, token validator, and scaffold CLI.

## Architecture
- `build/` - Style Dictionary config and build script
- `lint/` - Shareable Stylelint config (bans hardcoded values)
- `schema/` - `tokens.schema.json` (DTCG structure, JSON Schema 2020-12), `values.js` (per-`$type` value rules from DTCG 2025.10), and `validate.js` (schema check, value check, cross-file reference resolution)
- `templates/` - Files scaffolded into consuming projects via `init`
- `bin/cli.js` - CLI entry point (`init`, `build`, `validate`)
- `examples/` - Reference token sets (minimal and full)
- `test/` - `node --test` suite; covers build, CLI, validator, scaffold, and the lint config

## Token Format
W3C DTCG (Design Tokens Community Group) JSON with `$value`, `$type`, `$description` fields. Four layers: primitives (raw values), semantic (role references), components (optional overrides), themes (`tokens/themes/*.json`, role overrides). `$type` inherits from the nearest ancestor group; a pure alias takes its target's type.

Target is the stable spec, **DTCG 2025.10**. In that version `dimension`, `duration` and `color` values are objects, not strings. The string forms still build and are still what `init` scaffolds, because hand-authoring `{"colorSpace":"srgb","components":[...]}` per swatch is miserable; `validate` counts them as legacy and `--strict` lists them. `examples/full` is written in the stable forms and CI checks it under `--strict`, so it is the migration reference.

Style Dictionary `^5` is a hard floor: on 4.x a spec-conformant dimension compiled to `[object Object]` silently.

## Commands
- `design-system init` - scaffold tokens, DESIGN.md, lint config, scripts, and the devDependency into a project
- `design-system build` - compile tokens/ to dist/tokens.css in the current project
- `design-system validate` - schema-check token files, check each value against its `$type`, and resolve every reference (`--strict` also fails on legacy value forms)
- `npm test` - run the suite

## Rules
- Never put visual style choices in this repo. It provides infrastructure only.
- Token files use DTCG format exclusively.
- All CSS output uses `outputReferences: true` so semantic tokens reference primitives via `var()`.
- `build/` and `schema/` are exported as library APIs via `index.js`, so they throw; only `bin/cli.js` sets an exit code.
- The lint property list and `templates/claude-md-design.md` are two halves of one contract. Change one, change the other, and cover it in `test/lint.test.js`.
- Theme output shape lives in `build/config.js` (`blocksForTheme`). A theme named `dark` answers `prefers-color-scheme` and an explicit `data-theme`; any other theme is opt-in only.
- A theme overriding a semantic role is not a duplicate definition. `schema/validate.js` indexes the base layer first for exactly this reason.
- Custom formats must pass `usesDtcg` through to `formattedVariables`, or every value renders as `undefined`.

## Peer dependencies
Stylelint and `stylelint-declaration-strict-value` are optional peers, so a consumer installing this package gets neither. `bin/init.js` adds them to the consuming project itself, with ranges derived from our own `peerDependencies`, so a scaffolded project can lint without anything installed by hand. `test/init.test.js` asserts every peer is wired.

## Not on npm
Installed from GitHub (`github:lacrx/design-system`). `bin/init.js` writes that spec into the consuming project's devDependencies; if the package is ever published, change `PACKAGE_SPEC` there.

## Stylelint plugin gotchas
`stylelint-declaration-strict-value` v1.10.x documents regex keys for the `ignoreValues` and `ignoreFunctions` hashes, but they never match; use a flat array or exact property keys. Custom messages interpolate `${property}`, `${value}` and `${types}`, not `{{ property }}`.
