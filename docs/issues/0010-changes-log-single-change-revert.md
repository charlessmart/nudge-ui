# 10 — Changes log + single-change revert

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop

## What to build

A changes log recording every edit made through the token panel (#8) or style editors (#9) as a structured change:

```
{ elementId, property, oldValue, newValue, tokenName?, source: { file, line, component } }
```

Changes are grouped by element in the log UI. Each change row supports single-change revert (removes that change and rebuilds the managed stylesheet from the remaining log). The managed stylesheet is always a pure function of the changes log — iterate the log, emit the rules — so revert is just "remove the entry and rebuild the sheet."

This log is what the prompt generator (#11) reads to produce the agent handoff.

## Acceptance criteria

- [ ] Every edit (token swap, style editor change, replace-with-token) appends a structured change record to the log
- [ ] Each record has `elementId`, `property`, `oldValue`, `newValue`, `tokenName?`, and `source: { file, line, component }`
- [ ] Changes are grouped by element in the log UI
- [ ] Single-change revert removes one entry and rebuilds the managed stylesheet from the remaining log
- [ ] Managed stylesheet is always rebuildable from the log (rebuild function iterates log → emits rules)
- [ ] Reverting a change restores the element's pre-edit visual state
- [ ] Log survives inspector toggle (open/close `Alt+I`) without losing entries

## Blocked by

- #8 — Token panel edit loop + managed stylesheet