# @lacrx/design-system

Cross-project design token infrastructure: a build pipeline, a lint config that
enforces token usage, a token validator, and a scaffold CLI.

It ships no visual style choices. Colours, type and spacing live in the
consuming project's `tokens/` directory. This repo decides the shape of that
data and what happens to it, nothing about how it looks.

## Install

The package is not published to npm. Install it from GitHub:

```sh
npm install --save-dev github:lacrx/design-system
```

Requires Node 20 or newer. The `--watch` flag uses recursive `fs.watch`, which
Linux only supports from Node 20.

## Quick start

```sh
npx design-system init     # scaffold tokens, DESIGN.md, lint config, scripts
npm install                # pull in the dependency init just added
npm run build:tokens       # tokens/ -> dist/tokens.css
```

`init` never overwrites a file that already exists, so it is safe to re-run
after the package is updated.

## Commands

| Command | What it does |
| --- | --- |
| `design-system init` | Scaffold `tokens/`, `DESIGN.md`, `.stylelintrc.json`, CLAUDE.md rules, and the `build:tokens` / `validate:tokens` scripts. Adds itself to `devDependencies`. |
| `design-system build` | Compile every token file to CSS custom properties. |
| `design-system validate` | Check token files against the schema and resolve every reference. |

Both `build` and `validate` take `--source <dir>` (default `tokens`). `build`
also takes `--output <dir>` (default `dist`), `--filename <name>` (default
`tokens.css`) and `--watch`.

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

`$type` is inherited from the nearest ancestor group, and a token whose value is
a pure alias takes the type of its target.

Build output uses `outputReferences: true`, so the semantic layer compiles to
`var()` rather than to a flattened copy of the primitive:

```css
--color-blue-500: #3366CC;
--bg-primary: var(--color-blue-500);
```

## What `validate` catches

Beyond the file shape, which is checked against `schema/tokens.schema.json`:

- a reference that resolves to nothing, including one nested inside a composite
  value such as a shadow
- a literal value in the semantic layer
- the same token path defined in two files
- a token with no `$type` on it or on any ancestor group
- malformed JSON, reported by file name

`build` also fails on an unresolved reference and writes nothing, so a broken
token set cannot reach `dist/`.

## Lint

`init` writes a `.stylelintrc.json` that extends the shared config. It forces
colour, spacing, radius and type values through CSS custom properties:

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
