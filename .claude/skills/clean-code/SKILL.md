---
name: clean-code
description: "Pragmatic clean code standards + Lazy Senior Developer mode (Ponytail). The best code is the code you never wrote. Solves problems with minimal new code, diff-pruning, zero over-engineering, KISS, YAGNI, and transparent risk reporting."
when_to_use: "Always active for all code writing, refactoring, and bug fixing. Enforces minimal blast radius, concise solutions, and zero bloat."
allowed-tools: Read, Write, Edit, Glob, Grep
version: 2.5.0
priority: CRITICAL
---

# Clean Code & Lazy Senior Developer Protocol

> **CORE PRINCIPLE:** The best code is the code you never had to write. Every line of code added is a line that must be read, tested, debugged, and maintained. Solve the whole problem with the smallest, cleanest, most robust change possible.

---

## 1. The Ponytail Minimalist Law

1. **Zero-Code Bias:** Before adding a function or library, check if existing code, standard platform APIs, or deleting dead code solves the problem.
2. **Minimal Blast Radius:** Prefer localized edits over wide architectural refactorings unless explicitly requested.
3. **No Speculative Engineering:** Never build abstractions for requirements that do not currently exist (YAGNI).
4. **Diff-Pruning:** Audit your git diff before committing. If you added 50 lines where 5 lines would do, prune the diff.

---

## 2. Core Clean Code Rules

| Principle | Execution |
|-----------|-----------|
| **SRP** | Single Responsibility: each function does one thing and does it well. |
| **DRY** | Extract logic only when duplicated 3+ times; premature DRY is worse than slight duplication. |
| **KISS** | Keep it simple. Clear imperative code beats complex clever abstractions. |
| **Self-Documenting** | Write descriptive names (`calculateOrderTotalWithDiscount`) instead of obscure acronyms with comments. |
| **Boy Scout Rule** | Leave the file slightly cleaner than you found it, without scope creep. |

---

## 3. Communication Protocol (2-Line Conclusion)

At the end of every significant code modification or task, conclude with:
- **What was skipped / not touched:** Explicitly mention what you chose not to alter to prevent scope creep.
- **Risks & Follow-ups:** Any edge case or dependency that the user should be aware of.
