---
name: recall
description: Review the current diff (or a named file/folder/segment) against the recorded engineering lessons in docs/lessons/ — checking whether any past wound is recurring in the code at hand. Use when the user types /recall, asks "have we been burned by this before?", asks to check work against past lessons, or wants a pre-PR pass over the branch. ALSO invoke proactively before opening a PR and when a just-finished implementation touches an area a lesson names. This is NOT a bug hunt or a general style review (that's /code-review and the code-style-reviewer agent) — it checks only for recurrence of this repo's recorded wounds.
---

# Recall — check the position against the repertoire

The read half of the lessons system (`/lessons` is the write half): load the
wound journal, then look at the code and report where a recorded symptom is
recurring. The graduated principles in the root `CLAUDE.md` are covered by
the general style review; this skill is specifically the **local, earned**
lessons — the ones with positions attached.

## Procedure — load, then look (never scan-per-lesson)

1. Read **every** file in `docs/lessons/` first (they are small; the
   **Symptom** line is the trigger, the **Position** snippet is the shape to
   match against). Hold them as priors.
2. Determine the target: the working diff / branch-vs-main by default, or
   the file/folder/segment the user named.
3. Read the target **once**, with the lessons in mind — the way a reviewer
   who personally lived those wounds would. Do not iterate lessons × code
   checking each in turn: that procedure manufactures findings (an eager
   reviewer given N lessons finds N matches) and misses the compound smells
   no single lesson names.

## Reporting

Report only matches where the lesson's **symptom genuinely describes the
code at hand** — keyword overlap with the principle is not a match; the
felt situation recurring is. For each finding:

- **Position**: file:line and the minimal snippet.
- **Lesson**: link the `docs/lessons/` file that fired.
- **Why it matches**: one or two sentences tying the symptom line to this
  code — evidence, not vibes.
- **Suggested move**: what the lesson's resolution implies here.

**An empty report is a fine outcome** — say "no recorded wound recurs here"
and stop. A forced match poisons trust in the whole system faster than a
missed one; the user's instincts remain the backstop for smells the journal
doesn't hold yet.

## The calibration loop

Recall results are evidence about lesson quality, in both directions:

- If the user **confirms** a match: the lesson works; no action.
- If the user **rejects** a match as a false positive: the lesson's symptom
  line is probably miswritten (too broad, or describing the principle
  instead of the felt situation). Offer to sharpen it in the lesson file.
- If the user then spots a smell recall **missed** and it maps to an
  existing lesson: the symptom line is too narrow — same offer.
- If the missed smell maps to **no** lesson: that is a `/lessons` moment,
  not a recall failure.
