## Design System

All UI uses the design token system. Read `DESIGN.md` for visual direction before any UI work.

### Rules
- All colors via CSS custom properties from `dist/tokens.css`. Never hardcode hex, rgb, hsl, or named CSS colors. `rgb()` and `hsl()` are not escape hatches; `color-mix()` is allowed only when mixing tokens.
- All spacing via `--space-*` tokens. Never use arbitrary px/rem values for margin, padding, or gap. `0`, `auto` and percentages need no token.
- All font sizes via `--font-size-*` tokens.
- All font families via `--font-*` tokens (e.g. `--font-display`, `--font-body`).
- All border radii via `--radius-*` tokens.
- Use semantic token names (`--bg-primary`, `--text-secondary`) in component code, not primitive names (`--color-orange-100`).
- Read existing components before creating new ones.
- New components follow existing patterns (same file structure, same prop conventions, same naming).

Every rule above is enforced by `.stylelintrc.json`. If stylelint passes and a rule is still broken, the lint config is wrong and should be fixed rather than worked around.

### Theming
- Never write a dark-mode value into component CSS. No `@media (prefers-color-scheme: dark)` blocks, no `.dark` class overrides, no second hardcoded colour.
- A colour that changes between themes is a semantic token whose override lives in `tokens/themes/dark.json`. Add it there and rebuild.
- Components read the same `--bg-primary` in both themes. If a component needs to know which theme is active, the token set is wrong.
- `data-theme="dark"` or `data-theme="light"` on `<html>` forces a theme; with neither, the OS preference wins.

### Token files
- Primitives: `tokens/primitives.json` (raw values, named by what they are)
- Semantic: `tokens/semantic.json` (role-based references, named by what they do; every value must be a reference, never a literal)
- Components: `tokens/components/*.json` (optional per-component overrides)
- Themes: `tokens/themes/*.json` (role overrides per theme; references only)
- Built CSS: see `DESIGN.md` frontmatter `built:` field for location (generated, do not edit)
- Visual direction: `DESIGN.md`

### Commands
- `npm run validate:tokens` - check token files and resolve every reference
- `npm run build:tokens` - compile tokens to CSS custom properties

After editing any token file, run both. The build fails and writes nothing if a reference does not resolve.
