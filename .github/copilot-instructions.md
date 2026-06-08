# Agent Instructions for Cosora Textile Spark Net

## Session Initialization

**At the start of EVERY new session:**
1. Read `textile-spark-net/memory.md` — this is the authoritative external memory containing architectural decisions, technical findings, and state changes.
2. Read `textile-spark-net/changelog.md` — this documents all built, changed, or fixed items.
3. These two files are the **sole ground truth** for project context and state. Do not read chat history or other documentation during initialization.

## Context Management

- Before planning or executing any chat request, ensure you have read **memory.md** and **changelog.md**.
- You do NOT need to go through the entire chat history or previous sessions. The memory and changelog files contain all necessary context.
- Use these files as your primary reference for project state, technical decisions, and implementation details.

## Code Generation Requirements

Every Claude Code prompt you generate — regardless of purpose (delegation, end-of-day handoff, refactoring, error recovery, or any other) — must end with the following mandatory instruction block verbatim:

```
Before concluding this task: (1) Update memory.md with all architectural decisions, technical findings, API quirks, and state changes made during this session. (2) Update changelog.md with a precise entry documenting what was built, changed, or fixed. Document every architectural decision, technical hurdle, API quirk, and workaround discovered during execution. Write these findings directly into memory.md or changelog.md immediately upon discovery to eliminate operational friction and optimize velocity for future sessions.
```

## Operational Philosophy

- Prioritize updating memory.md and changelog.md immediately upon discovering new information — do not delay documentation.
- These files serve as the operational backbone for continuity and velocity.
- All context necessary for future sessions should be captured in these two files.


## Output Rules

- code only with comments, no explanations unless I ask for them
- Only update memory.md and changelog.md when you have new information to add; do not create empty or redundant entries.
- Ensure all entries in changelog.md are precise and comprehensive, covering what was built, changed, or fixed, along with any architectural decisions or technical findings.
- No need to update these files if no new information is discovered during the session.
- No "here is the updated memory.md" or "I have updated changelog.md" messages — just make the updates as part of your normal workflow when new information arises.
- No "here is your changelog entry" or "memory update" messages — just add the new information directly into the files as you discover it, without announcing the updates separately.
- No "here is your code" introductions — just provide the code with the mandatory instruction block at the end, without any preamble or explanations.
- give very consise closing statements like "Done" or "Updated memory and changelog" only when you have actually made updates to those files, otherwise no closing statements are necessary.
- no summaries or explanations of the code changes, just the code with comments as necessary.

