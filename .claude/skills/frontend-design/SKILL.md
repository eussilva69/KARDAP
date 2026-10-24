---
name: frontend-design
description: "Anti-slop frontend engineering & art direction framework (TasteSkill v2 + Design System). Enforces distinctive typography, intentional palettes, bespoke section blueprints, motion hierarchy, and strict avoidance of generic AI templates."
when_to_use: "When designing or building web UI, landing pages, marketing sites, dashboards, portfolios, or component redesigns. Enforces production-grade art direction without generic AI slop."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 2.0.0
priority: HIGH
---

# Unified Frontend Design & Anti-Slop Art Direction Framework

> **CORE PRINCIPLE:** Stop shipping generic AI frontends (the ubiquitous centered hero, cookie-cutter 3-card grid, meaningless purple gradient, and boring sans-serif). Build interfaces with distinct personality, clear editorial tone, and intentional design choices.

---

## 1. The Anti-Slop Prohibitions (Zero AI Tells)

1. **No Cliché Gradients:** Never use default purple-to-blue linear gradients on dark cards. Use rich HSL palettes, subtle grain, tonal shifts, or clean monochromatic contrast.
2. **No Cookie-Cutter Feature Cards:** Avoid identical 3-column boxes with a centered icon in a circle. Use varied density, asymmetric layouts, visual anchor points, or interactive previews.
3. **No Meaningless Buzzword Copy:** Avoid headlines like "Unleash the Power of AI with Seamless Solutions". Write clear, punchy, human copy that states what the product actually does.
4. **No Generic Browser Fonts:** Use deliberate typography pairings (editorial serif with technical mono, distinctive geometric sans with warm humanist text).

---

## 2. The 5 Art Direction Pillars

### 1. Distinctive Personality & Tone
Every site needs a distinct character:
- **High-End Minimalist:** Deep whitespace, Swiss typography, stark contrast, restrained motion.
- **Warm Editorial:** Expressive serifs, earthy palettes, rich photography borders, human warmth.
- **Technical & Precision:** Dense monospace data, subtle borders, high information hierarchy, crisp feedback.
- **Bold Brutalist / Modernist:** Massive typography, high contrast, sharp geometric divisions, confident presence.

### 2. Layout & Spatial Composition
- Establish visual anchors: one clear dominant focal point per viewport.
- Break symmetry deliberately to guide the eye toward conversion actions.
- Respect responsive rhythm: mobile layouts must be designed thoughtfully, not merely squeezed desktop grids.

### 3. Motion & Micro-Interactions
- Keep transitions snappy (150ms-300ms) with ease-out or spring curves.
- Motion should give physical reality to the interface (hover states, drawer slides, tactile button clicks).
- Respect `prefers-reduced-motion` at all times.

---

## 3. Modular References (Read Only as Needed)

| Reference File | Domain |
|----------------|--------|
| `references/type.md` | Font pairing formulas, scale ratios, and optical sizing |
| `references/colour.md` | Palette construction, 60-30-10 rule, semantic tokens |
| `references/layout.md` | Asymmetric grids, bento grids, spatial tension |
| `references/motion.md` | Micro-interaction timing, entry animations, scroll choreography |
| `references/copy.md` | Anti-AI headline writing, button labels, value propositions |
| `references/critique.md` | Pre-flight checklist to eliminate all AI design smells |
| `references/app-screens.md` | Complex dashboard patterns, tables, filter bars |
