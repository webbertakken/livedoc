# livediagram upstream

LiveDoc began as a fork of [livediagram](https://github.com/livediagram-app/livediagram.app) and is now a **parallel
product**: its own name, its own domain, its own deployments and its own
[purpose](../001-project-vision/purpose.md). livediagram is its **upstream**: the project it came from, which keeps
moving on its own course.

## Picked by hand

LiveDoc does not track upstream. A change from livediagram enters LiveDoc only when it is **picked**: someone chooses
it, ports it, and it lands through a LiveDoc pull request like any other change.

- **There is no regular merge.** LiveDoc diverges freely wherever its purpose asks it to; nothing obliges it to stay
  close to livediagram.
- **A pick is judged against LiveDoc's specs**, not livediagram's. A pick that contradicts a LiveDoc spec changes the
  spec first, or is left out.
- **A pick names its source** in its pull request: the upstream pull request or commit it came from.
- **Nothing flows back automatically.** A LiveDoc change that would serve livediagram too is offered upstream as its
  own pull request, by choice.

## What is shared, and what is not

- **Shared at the start:** the codebase, the domain model (documents, tabs, tab kinds), the canvas tab kinds and the
  specs that describe them. Those specs stay true for LiveDoc until a LiveDoc change moves them.
- **Not shared:** the name, the domains, the deployments, their resources and secrets, the published packages and the
  command line's name. LiveDoc never deploys to, publishes as, or reaches livediagram's infrastructure.
- **Left behind:** livediagram's Community gallery. LiveDoc has no public gallery
  ([purpose](../001-project-vision/purpose.md#boundaries-that-have-moved)), so an upstream change to it, or to a
  piece only it used, is never picked.
- **Diverged:** spreadsheets. LiveDoc's [spreadsheet](../029-sheets/spreadsheet.md) replaces the Plan Sheet both
  products shared; upstream changes to the Plan Sheet, its store or its engine are picked only where they still
  apply to the spreadsheet.

## The git remote

Every LiveDoc checkout has two remotes: `origin`, LiveDoc's own repository, and `liveworkspace`, the upstream
project. `liveworkspace` is fetch-only: its push URL is disabled, so nothing reaches livediagram by accident. GitHub
records LiveDoc as a fork of the upstream, so `gh` is pointed at `origin` (`gh repo set-default webbertakken/livedoc`);
otherwise it opens pull requests against the upstream.

## The name

LiveDoc never shows livediagram's name, except where it means the upstream project: this spec, the purpose's origin
and the licences page's credit. A few hash domains whose outputs are stored
(`livediagram:adder:v1` and its kin) keep the name, because renaming them would orphan existing data; nobody sees
them. `apps/help/lib/brand-name-guard.test.ts` fails on any other mention.
