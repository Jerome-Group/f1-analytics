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

The right-hand column is not editable here. Four of these labels are created on this repository
by the hub's Terraform (`Jerome-Group/org`, `modules/repository`), and `wontfix` comes from
GitHub's own default label set — renaming one means renaming it in the hub, which renames it
everywhere. A label edited by hand here is drift the next `terraform apply` reverts.

The same is true of the `wayfinder:*` labels the wayfinding operations in
`issue-tracker.md` name: they come from the hub too, for the same reason.
