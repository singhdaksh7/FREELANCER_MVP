# Server Action Repro — Version Matrix (PHASE 7, Part 1)

Captured from the working tree at commit `383eaec` (branch `main`) on 2026-08-04.

## Exact installed versions (lockfile-resolved, not declared ranges)

| Package | package.json range | Resolved (npm ls / package-lock.json) |
|---|---|---|
| next | `16.2.12` | **16.2.12** |
| react | `19.2.4` | **19.2.4** |
| react-dom | `19.2.4` | **19.2.4** |
| node | (engine not pinned) | **v24.6.0** |

`npm ls react react-dom next --depth=0` resolves to a single deduped copy of
each package — no duplicate React/React DOM instances in the tree (ruling out
the classic "two React copies" class of hook/state bugs).

The project's declared `package.json` versions are exact pins already (not
`^`/`~` ranges), so the installed lockfile versions match the declared
versions exactly. There is no drift between what's committed and what's
installed.

## Notes

- No canary/RC of Next.js or React is installed anywhere in the tree.
- This report intentionally does not include a live 3-way dependency-patch
  test matrix (current / latest React 19.2.x patch / latest Next 16.2.x
  patch) — see the Phase 7 final report for why that was scoped out of this
  pass and what commands to run to produce it later.
