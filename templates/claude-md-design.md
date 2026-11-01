## Design System

All UI uses the design token system. Read `DESIGN.md` for visual direction before any UI work.

### Rules
- All colors via CSS custom properties from `dist/tokens.css`. Never hardcode hex, rgb, hsl, or named CSS colors.
- All spacing via `--space-*` tokens. Never use arbitrary px/rem values for margin, padding, or gap.
- All font sizes via `--fontSize-*` tokens.
- All border radii via `--radius-*` tokens.
- Use semantic token names (`--bg-primary`, `--text-secondary`) in component code, not primitive names (`--color-orange-100`).
- Read existing components before creating new ones.
- New components follow existing patterns (same file structure, same prop conventions, same naming).

### Token files
- Primitives: `tokens/primitives.json` (raw values, named by what they are)
- Semantic: `tokens/semantic.json` (role-based references, named by what they do)
- Built CSS: `dist/tokens.css` (generated, do not edit)
- Visual direction: `DESIGN.md`
