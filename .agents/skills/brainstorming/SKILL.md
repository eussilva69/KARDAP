---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new. Combines Socratic questioning protocol, anti-assumption inquiry, 2-3 approaches with trade-offs, and incremental scope definition."
when_to_use: "When exploring options before implementation, clarifying requirements, designing new features, or when the user needs creative problem-solving. Use before writing any non-trivial code."
allowed-tools: Read, Glob, Grep
version: 2.0.0
priority: CRITICAL
---

# Unified Brainstorming & Requirements Engineering Protocol

> **CORE PRINCIPLE:** The agent builds what it *believes* the human partner wants, and that belief is usually thinner than it feels. This skill is for discovering what they actually want, why, and exploring 2-3 concrete approaches BEFORE anything gets built.

---

## 1. First: What Do You Actually Know?

Before replying or implementing, ask yourself: *What do I know about what they want, and why?*

- **Everything that matters is in the request** (e.g. "make the button background red"): Quick, clear, single-step task. Do it and say what you did.
- **Something non-trivial is missing or underspecified**: You MUST start the brainstorming dialogue. Do NOT start writing code based on assumptions.

### The Inquiries Checklist
1. **The Core Why:** What business or user problem does this solve?
2. **Success Metric:** How will we know this feature is working successfully?
3. **Constraints & Context:** What existing systems, dependencies, or conventions must be respected?
4. **Edge Cases:** What happens when data is empty, errors occur, or inputs are unusual?

---

## 2. Lay Out 2-3 Approaches with Trade-Offs

Before touching code on new features or refactorings, lay out 2-3 distinct approaches in a clear message:

| Approach | Strategy | Pros | Cons / Trade-offs | Complexity |
|----------|----------|------|-------------------|------------|
| **Option A (Minimalist)** | Smallest change, fastest to ship, minimal blast radius | Zero bloat, least maintenance | May defer advanced flexibility | Low |
| **Option B (Recommended / Balanced)** | Robust, scalable, follows project conventions | Clean architecture, durable | Moderate initial effort | Medium |
| **Option C (Comprehensive)** | Full-featured, extensible, future-proof | Maximum capability | Higher initial code surface | High |

Ask the user to pick one or suggest a hybrid before writing implementation code.

---

## 3. Operational Socratic Questioning & Communication

1. **One Question at a Time:** Do not overwhelm the user with 10 questions. Ask the single most critical clarifying question first.
2. **Concrete Examples over Abstractions:** Provide a snippet or visual sketch rather than vague theoretical descriptions.
3. **Incremental Progress Reporting:** When building multi-step features, report after each discrete chunk.
4. **Graceful Error Handling:** If an approach hits a roadblock during execution, declare it openly with the exact cause and propose an alternative rather than silently hacking a workaround.

---

## 4. Execution Guardrails

1. **Verify Before Modifying:** Check `CONTEXTO_PROJETO.md` and key files first.
2. **Respect Existing Architecture:** Never introduce a foreign framework or paradigm when the project already has an established pattern.
3. **Zero Waste:** Produce clean, well-tested code that adheres to `clean-code` and project standards.
