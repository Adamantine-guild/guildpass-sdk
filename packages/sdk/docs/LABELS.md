# GitHub Labels — GuildPass SDK

Create labels via **GitHub Settings → Labels** or with the GitHub CLI:

```bash
gh label create "good first issue" --color "7057ff" --description "Well-scoped task for new contributors"
gh label create "help wanted" --color "008672" --description "Extra attention or contributor help needed"
gh label create "bug" --color "d73a4a" --description "Something is not working"
gh label create "feature" --color "a2eeef" --description "New feature or enhancement request"
gh label create "documentation" --color "0075ca" --description "TypeDoc, README, or docs/ improvements"
gh label create "breaking change" --color "b60205" --description "This change breaks the public API (semver major)"
gh label create "tests" --color "bfd4f2" --description "Related to Vitest test coverage"
gh label create "types" --color "f9d0c4" --description "TypeScript type definitions"
gh label create "examples" --color "e4e669" --description "Related to the examples/ directory"
gh label create "priority: low" --color "eeeeee" --description "Low priority"
gh label create "priority: medium" --color "fbca04" --description "Medium priority"
gh label create "priority: high" --color "e99695" --description "High priority — address promptly"
gh label create "needs-triage" --color "ededed" --description "Awaiting maintainer triage"
gh label create "duplicate" --color "cfd3d7" --description "This issue or PR already exists"
gh label create "wont-fix" --color "ffffff" --description "This will not be worked on"
```

## Label Usage Guide

| Label | When to use |
|---|---|
| `good first issue` | Clear scope, low risk, TypeScript-only, great for new contributors |
| `help wanted` | Community help wanted; may require more SDK context |
| `bug` | Confirmed broken behaviour in the SDK |
| `feature` | New method, module, or exported type |
| `documentation` | TypeDoc comments, README, or `docs/` changes |
| `breaking change` | Removes or changes existing public API — semver major |
| `tests` | Vitest test additions or fixes |
| `types` | TypeScript type definition changes |
| `examples` | Changes to or additions in `examples/` |
| `priority: high` | Blocks SDK consumers — address within 48 h |
