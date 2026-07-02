# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

This repo has no pre-existing labels, so the defaults above are used as-is. GitHub does **not** auto-create labels — `gh issue edit --add-label <name>` errors if the label doesn't exist yet. Create them once up front:

```bash
gh label create needs-triage    --color BFD4F2 --description "Maintainer needs to evaluate"
gh label create needs-info      --color FBCA04 --description "Waiting on reporter for more info"
gh label create ready-for-agent --color 0E8A16 --description "Fully specified, AFK-ready"
gh label create ready-for-human --color 1D76DB --description "Requires human implementation"
gh label create wontfix         --color E4E669 --description "Will not be actioned"
```

Edit the right-hand column above if you later adopt different label names.
