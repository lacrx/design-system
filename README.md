# @lacrx/design-system

Cross-project design token infrastructure: a build pipeline, a lint config that
enforces token usage, a token validator, and a scaffold CLI.

It ships no visual style choices. Colours, type and spacing live in the
consuming project's `tokens/` directory. This repo decides the shape of that
data and what happens to it, nothing about how it looks.

## Install

The package is not published to npm. Install it from a release tarball:

```sh
npm install --save-dev https://github.com/lacrx/design-system/archive/refs/tags/v0.2.0.tar.gz
```

Not `github:lacrx/design-system`: that form has no ref, so a fresh install
with no lockfile takes whatever `main` is at that moment, and npm records
`git+ssh://git@github.com/...` in the lockfile even when asked for https, so
`npm ci` then needs SSH access to a public repo. `init` writes the pinned
tarball for you.

Requires Node 20 or newer. The `--watch` flag uses recursive `fs.watch`, which
Linux only supports from Node 20.

## Quick start

```sh
npx design-system init     # scaffold tokens, DESIGN.md, lint config, scripts
npm install                # pull in the dependency init just added
npm run build:tokens       # tokens/ -> dist/tokens.css
npm run lint:css           # fail on any hardcoded visual value
npm run contrast:tokens    # fail on a colour pair that misses WCAG AA
```

`init` never overwrites a file that already exists, so it is safe to re-run
after the package is updated.

## Commands

| Command | What it does |
| --- | --- |
| `design-system init` | Scaffold `tokens/`, `DESIGN.md`, `.stylelintrc.json`, CLAUDE.md rules, and the `build:tokens` / `validate:tokens` / `lint:css` scripts. Adds itself, Stylelint and the Stylelint plugin to `devDependencies`. |
| `design-system build` | Compile every token file to CSS custom properties. |
| `design-system validate` | Check token files against the schema, check each value against its `$type`, and resolve every reference. |
| `design-system contrast` | Check declared colour pairs against WCAG 2.1, in every theme. |

Both `build` and `validate` take `--source <dir>` (default `tokens`). `build`
also takes `--output <dir>` (default `dist`), `--filename <name>` (default
`tokens.css`), `--watch`, `--js` and `--check`. `validate` takes `--strict`,
which also fails on pre-2025.10 value forms. `contrast` takes `--level AA|AAA`
to override what each pair declares.

Unknown flags are an error rather than being silently ignored.

## Token format

W3C DTCG JSON: `$value`, `$type`, `$description`. Three layers:

- **primitives** (`tokens/primitives.json`) raw values, named for what they are
  (`color.blue.500`).
- **semantic** (`tokens/semantic.json`) role references, named for what they do
  (`bg.primary`). Every value must be a reference; `validate` fails on a
  literal here.
- **components** (`tokens/components/*.json`, optional) per-component
  overrides.
- **themes** (`tokens/themes/*.json`, optional) overlays that re-point semantic
  roles at different primitives. See Theming below.

`$type` is inherited from the nearest ancestor group, and a token whose value is
a pure alias takes the type of its target.

Build output uses `outputReferences: true`, so the semantic layer compiles to
`var()` rather than to a flattened copy of the primitive:

```css
--color-blue-500: #3366CC;
--bg-primary: var(--color-blue-500);
```

## Value forms

The DTCG spec reached its first stable version, 2025.10, on 2025-10-28. That
version writes `dimension`, `duration` and `color` values as objects:

```json
{ "$value": { "value": 16, "unit": "px" } }
{ "$value": { "colorSpace": "srgb", "components": [0.2, 0.4, 0.8], "hex": "#3366CC" } }
```

The older string forms (`"16px"`, `"#3366CC"`) still build and are still what
`init` scaffolds, because they are far easier to hand-author. `validate`
accepts both and counts the string forms as legacy; `--strict` lists them.
`examples/full` is written entirely in the stable forms and is checked under
`--strict` in CI, so it doubles as the migration reference.

Style Dictionary 5.4.0 is the floor for the object form. On 4.x a conformant
dimension compiled to `--space-md: [object Object]` with no error, which is why
this package requires `^5`.

## Theming

Drop a file in `tokens/themes/`. It re-points semantic roles at other
primitives, and nothing else:

```json
{ "bg": { "$type": "color", "primary": { "$value": "{color.neutral.900}" } } }
```

`tokens/themes/dark.json` compiles to both an OS-preference block and an
explicit opt-in, in one stylesheet:

```css
:root { --bg-primary: var(--color-neutral-0); }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg-primary: var(--color-neutral-900); }
}
:root[data-theme="dark"] { --bg-primary: var(--color-neutral-900); }
```

So the OS preference is honoured by default, `data-theme="light"` opts out of
it, and `data-theme="dark"` forces dark. Any theme other than `dark` gets only
the `[data-theme="<name>"]` block, because the browser has no signal for it.

A theme block contains only the tokens that theme overrides, and they stay as
`var()` references, so the primitives are never duplicated.

## Using tokens from JavaScript

`build --js` also emits `tokens.js` and `tokens.d.ts`, which is what `init`
wires into `build:tokens`. The lint config can only police stylesheets, so
without this nothing stops `style={{ color: '#fff' }}` in a component.

```js
import { tokens } from './dist/tokens.js';

<div style={{ color: tokens.text.primary, padding: tokens.space.md }} />
// -> color: var(--text-primary); padding: var(--space-md)
```

Every leaf is a `var()` reference, not a resolved value, so the browser
resolves it and a themed page just works. Types are literal, so a renamed
token is a type error rather than a variable that silently resolves to
nothing.

The module also exports `values`, the resolved values of the base theme, for
the places a CSS variable cannot reach: a canvas fill, a
`<meta name="theme-color">`. It is not theme-aware, and the generated file says
so.

## Checking contrast

A semantic colour token declares what it is meant to sit on:

```json
"text": {
  "$type": "color",
  "muted": {
    "$value": "{color.neutral.500}",
    "$extensions": { "com.lacrx.contrast": { "on": ["bg.primary"], "level": "AA" } }
  }
}
```

`design-system contrast` then measures every pair in the base theme and again
in each theme overlay, which is where a palette edit usually breaks contrast
without anyone noticing:

```
ok   base: text.muted on bg.primary: 4.87:1 (AA normal needs 4.5:1)
FAIL dark: text.muted on bg.primary: 2.82:1 (AA normal needs 4.5:1)
```

`level` is `AA` (default) or `AAA`, `size` is `normal` (default) or `large`.
Thresholds follow WCAG 2.1: 4.5, 3, 7 and 4.5 respectively.

Colours outside sRGB are measured through their `hex` fallback, and skipped
with a note when there is none. A translucent colour is skipped too, because
its real contrast depends on what sits behind it, and a number there would be
a guess.

Those two lines above are real: the example palette in this repo failed AA on
`text.muted` in both themes when the checker was first run, and its `warm`
ramp had step 900 lighter than step 800. Both are fixed.

## Keeping the build honest

`build --check` rebuilds in memory, compares against what is on disk, writes
nothing, and exits non-zero if they differ. For a project that commits its
`dist/`, that is the CI guard against a token edit landing without its
rebuilt output.

## What `validate` catches

Beyond the file shape, which is checked against `schema/tokens.schema.json`:

- a value that does not match its `$type`: a malformed hex colour, an unknown
  `colorSpace`, a `dimension` in `em`, a `fontWeight` outside 1-1000, a
  `cubicBezier` whose x values leave 0..1
- a reference that resolves to nothing, including one nested inside a composite
  value such as a shadow
- a literal value in the semantic or theme layers
- the same token path defined in two files
- a token with no `$type` on it or on any ancestor group
- malformed JSON, reported by file name

A theme re-pointing a role that the semantic layer already defines is the
point of a theme, so it is not reported as a redefinition.

`build` also fails on an unresolved reference and writes nothing, so a broken
token set cannot reach `dist/`.

## Lint

`init` writes a `.stylelintrc.json` that extends the shared config, and adds
Stylelint and `stylelint-declaration-strict-value` to the project. They are
optional peers here, so installing this package alone brings neither and the
config would have nothing to run in. The rules force colour, spacing, radius
and type values through CSS custom properties:

```css
/* rejected */
.card { color: #fff; padding: 12px; border: 1px solid #ccc; }

/* accepted */
.card { color: var(--text-primary); padding: var(--space-md); border: 1px solid var(--border-default); }
```

Two details worth knowing:

- Functions are rejected for colour properties, because `rgb(0 0 0)` otherwise
  passes as a legitimate substitute for a variable. They are allowed elsewhere,
  so `calc(var(--space-md) * 2)` and `clamp()` still work, as does `color-mix()`
  when it is mixing tokens.
- `0`, `auto`, percentages and `fr` units need no token. They are layout maths,
  not design decisions.

A shorthand violation such as `padding: 12px` is reported once per longhand the
shorthand expands into. One fix clears them all; the duplication is the price of
catching the colour inside `border: 1px solid #ccc`.

## Development

```sh
npm test
```

The suite covers the build pipeline, the CLI, the validator, the scaffold, and
the lint config itself, including that the scaffolded project builds and
validates without edits.

## License

MIT. See [LICENSE](LICENSE).
