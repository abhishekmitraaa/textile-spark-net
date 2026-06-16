# Claude Code Documentation Hooks

This file configures automatic documentation updates for Claude Code sessions.

## Documentation Update Protocol

After each Claude Code session, the following files are automatically updated via hooks configured in `.claude/settings.json`:

### 1. CLAUDE.md
**Update triggers**: Architectural decisions, technical findings, constraint changes, scope clarifications

**What to update**:
- Project architecture changes or refinements
- New critical business constraints discovered
- Technical decisions and their rationale
- Updated tech stack or dependency information
- Changes to routing, state management, or core patterns
- Known issues or workarounds identified

**Format**: Maintain existing structure. Add new sections if needed. Link to specific files using relative paths.

### 2. changelog.md
**Update triggers**: Features built, bugs fixed, refactoring completed, tests added

**What to update**:
- What was built, changed, or fixed (with commit hashes if applicable)
- File ranges affected (e.g., `src/pages/Index.tsx:1-150`)
- Breaking changes or migration notes
- Deployment notes if applicable

**Format**: Chronological entries with dates, descriptions, and file references. Include summary of changes.

### 3. memory/MEMORY.md
**Update triggers**: New project-specific knowledge, business context, team feedback

**What to update**:
- Project-specific memories that will be useful in future sessions
- User preferences and feedback on how to collaborate
- Business context and constraints
- References to external systems (Linear, Grafana, etc.)

**Format**: Maintain index of memory files. Each memory is a separate .md file with frontmatter.

## Hook Behavior

- Hooks fire **after chat completion** without prompting
- Updates are **intelligent** — only modified if work actually occurred
- No update if no meaningful changes were made
- All updates are **git-tracked** for audit trail
- Updates respect existing file structure and formatting

## Automatic Trigger Conditions

Hooks execute when:
1. Code changes are made and committed
2. Significant findings are discovered
3. Project constraints or architecture are clarified
4. User feedback on approach is received

Hooks do NOT execute for:
- Read-only exploration
- Explanatory conversations
- Questions answered without code changes
