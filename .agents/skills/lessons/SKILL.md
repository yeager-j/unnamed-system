---
name: lessons
description: Capture an engineering lesson — a pain point, smell, or instinct that just got a name — as a dated markdown file in docs/lessons/. Use when the user types /lessons or says "that's a lesson" / "log this one". ALSO invoke proactively, without being asked, whenever: an end-of-ticket retrospective surfaces a principle that was uncovered or invoked; a repair changes how future work should be done; the user voices a pre-verbal smell and gets a named pattern back; or a design discussion prices a decision with real evidence (a migration cost, a bug that a structure would have prevented). Do NOT invoke for routine bug fixes or observations that don't generalize — an empty retrospective is a fine outcome.
---

# Lessons — the wound journal

One markdown file per engineering lesson, in `docs/lessons/`. The decision log
(`docs/engine-v2/decision-log.md`) records *choices at decision time*; this
folder records *lessons at repair time* — the moment an instinct got a name.
Lessons are **candidate principles in escrow** for the root `CLAUDE.md` Code
Style list: principles graduate to a numbered entry once they recur. The
`/recall` skill is the read half — it checks a diff or segment against this
journal — so every lesson is written to be *fired*, not just filed.

## The bar

Write a lesson only when an instinct got a name or the repair changes future
behavior. The genuine rate is roughly one per few tickets; if every ticket
produces one, they're being manufactured and the archive's signal dies
(padded lists are worse than silence). Never fabricate a lesson to be
helpful — when in doubt, ask the user whether it clears the bar.

## Interview, don't invent

The lesson is the user's instinct; the naming is collaborative. If the
symptom or context is thin, ask one to three sharp questions ("what did it
feel like right before the fix?", "what would have prevented this?") rather
than filling gaps yourself. Supply the canonical name and lineage for the
pattern when you know it (Meyer, Parnas, Fowler, Hunt & Thomas, …) — the
user values the citation trail.

## File format

Path: `docs/lessons/YYYY-MM-DD-short-slug.md` (date = when the lesson was
named, not when the pain started). Keep it under ~15 lines. Template:

```markdown
# YYYY-MM-DD — Title naming the wound, not the fix

**Symptom:** the felt trigger, written so a future reader (or Claude)
recognizes the situation *before* knowing the answer. This line is the
retrieval key — lessons are searched by symptom, never by principle name.

**Context:** where it happened (files, ticket, PR) and what it cost.

**Position:** the minimal code snippet exhibiting the smell, quoted directly
(and the shape of the fix, if short). Include this whenever the wound has a
code form — pattern recognition fires far better on the artifact than on
prose about it, for humans and Claude alike (chess is taught from positions,
not principle lists). Trim to the fewest lines that still smell.

**Principle:** the named pattern, with lineage and a link to the CLAUDE.md
Code Style number if one exists (e.g. "→ Code Style #8, Design by Contract").

**Action:** what was done or filed (ticket IDs, the fix, the gate added).
```

The symptom line carries the file: it is a diagnostic that must be able to
fire. "We duplicated a rule" is a conclusion; "the same check existed in two
files and I couldn't say which was canonical" is a symptom.

## After writing

1. Grep the other lessons for the same principle. If this makes **two or
   three** lessons sharing one principle, tell the user it's a graduation
   candidate: propose a one-to-two-sentence Code Style entry for the root
   `CLAUDE.md` (matching the register of #9/#10: bold title, lineage in
   parens), with the lesson files as provenance. The user decides.
   Graduation never deletes or thins the lessons: the principle is the
   template, the lessons are the positions it points back to — the abstraction
   drops the exception structure; the concrete case keeps it.
2. If the lesson names a concrete follow-up that isn't ticketed, offer to
   file it — don't ticket silently.
