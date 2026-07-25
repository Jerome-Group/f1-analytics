# The code is MIT, and the system it runs in is not

This repository was seeded with the Organisation's all-rights-reserved `LICENSE`, which grants
nothing ([ADR-0014 in the management hub](https://github.com/Jerome-Group/org/blob/main/docs/adr/0014-the-seeded-licence-grants-nothing.md)),
and [ADR-0019](https://github.com/Jerome-Group/org/blob/main/docs/adr/0019-a-public-repository-is-declared-by-the-module-and-argued-in-an-adr.md)
deliberately left it that way until somebody decided. The decision is **MIT**.

The reason is that it resolves a contradiction rather than merely picking a licence. ADR-0019 made
this repository public so that it could be *read* — and all-rights-reserved permits reading while
forbidding the half that makes reading worth anything, which is taking a piece of it. Publishing
something to be learned from while legally prohibiting learning from it is a position that only
holds if nobody looks closely. MIT is also the norm in this corner of the ecosystem: FastF1, the
library Analysis mode is built on, uses it.

**What MIT here does not do is make this system usable commercially, and that needs saying out
loud because the licence file will imply otherwise.** A working deployment requires OpenF1, which
is CC BY-NC-SA 4.0 — NonCommercial. The code in this repository is MIT and genuinely free to take;
the *system* it participates in cannot be run for commercial purposes by anyone, including its
author. A reader who checks `LICENSE` and stops there will conclude the opposite, so the README
states it plainly instead of leaving the licence file to be misread.

ShareAlike does not reach this code, and the reason is the structural one recorded in ADR-0003:
OpenF1 is **deployed, never vendored**. No upstream source is committed here, nothing is forked
into the tree, and nothing is adapted. A separate work that speaks to a service over an API is not
an adaptation of that service, and keeping that true is what keeps this paragraph true.

Nor does any licence in this repository say anything about the data. Formula 1's timing data is
Formula 1's; this project is unofficial, unaffiliated, and governed by their terms regardless of
what a file here says.

The alternative was to leave it closed. That is coherent — it promises nothing, so nobody can
misread it — and it was rejected because the caveat is easier to write than the contradiction is
to defend. AGPL was considered and dismissed: it buys a guarantee about derivative works that a
single-maintainer hobby project has no use for, at the cost of friction for everyone reading.

## Consequences

- **The README carries three caveats and they are load-bearing**: MIT covers this code only; a
  deployment requires NonCommercial software so the system cannot be commercialised; the data is
  Formula 1's and this is unofficial. Removing them leaves the `LICENSE` file actively misleading.
- **This is the irreversible direction.** Publishing can be undone in the sense that a repository
  can be made private; granting rights cannot, because a clone taken under MIT stays licensed
  under MIT. There is no path back from this record.
- **ADR-0003's "deploy, never vendor" rule is now load-bearing twice.** It was an architectural
  preference; it is now also what keeps ShareAlike away from MIT code. Vendoring OpenF1 would
  break this decision, not merely complicate it.

## Revisit when

- OpenF1 stops being a dependency — replaced, relicensed, or its normalisation written locally. The
  NonCommercial caveat exists only because of it, and would go with it.
- Something in this repository is wanted commercially. MIT does not stand in the way; the
  dependency does, and that is a different problem needing a different answer.
