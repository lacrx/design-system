# Design System

Cross-project design token infrastructure. Provides build pipeline, lint config, token validator, and scaffold CLI.

## Architecture
- `build/` - Style Dictionary config, build script, and `js.js` (the JS/TS module emitter)
- `lint/` - Shareable Stylelint config (bans hardcoded values)
- `schema/` - `tokens.schema.json` (DTCG structure, JSON Schema 2020-12), `values.js` (per-`$type` value rules from DTCG 2025.10), `tokens.js` (shared file reading and tree walking), `validate.js` (schema, value and reference checks), `contrast.js` (WCAG 2.1 pair checking)
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
- `design-system build` - compile tokens/ to dist/tokens.css in the current project (`--js` also emits tokens.js and tokens.d.ts; `--check` fails on stale output and writes nothing)
- `design-system contrast` - check declared colour pairs against WCAG 2.1 in every theme
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
- Theme passes run with `quiet: true`. Style Dictionary reports a collision and a filtered-reference warning for every single theme override, both structural to composing one stylesheet from several passes, and both already covered properly by `validate`. Do not silence the base pass.
- The JS export emits `var()` references, not resolved values, so it stays theme-aware. `values` exists for canvas and meta tags and is documented in the generated file as not theme-aware.
- Contrast pairs are declared in `$extensions` under `com.lacrx.contrast`, checked per theme. Non-sRGB colours are measured via their `hex` fallback and skipped when there is none; translucent colours are skipped rather than guessed.

## Peer dependencies
Stylelint and `stylelint-declaration-strict-value` are optional peers, so a consumer installing this package gets neither. `bin/init.js` adds them to the consuming project itself, with ranges derived from our own `peerDependencies`, so a scaffolded project can lint without anything installed by hand. `test/init.test.js` asserts every peer is wired.

## Not on npm, and releases are tagged
Installed from a release tarball: `https://github.com/lacrx/design-system/archive/refs/tags/v<version>.tar.gz`. `bin/init.js` builds that spec from its own `pkg.version`, so **a release is three steps that must stay in sync**: bump `version` in package.json, merge, then tag the merge commit `v<version>` and push the tag. Until the tag exists the scaffolded spec 404s.

Not the `github:lacrx/design-system` shorthand: it has no ref, so a fresh install with no lockfile floats on the default branch, and npm records `git+ssh://` in the lockfile even when asked for https, which makes `npm ci` need SSH for a public repo. Both measured, not assumed.

If the package is ever published to npm, `PACKAGE_SPEC` becomes a plain version range.

## Stylelint plugin gotchas
`stylelint-declaration-strict-value` v1.10.x documents regex keys for the `ignoreValues` and `ignoreFunctions` hashes, but they never match; use a flat array or exact property keys. Custom messages interpolate `${property}`, `${value}` and `${types}`, not `{{ property }}`.
