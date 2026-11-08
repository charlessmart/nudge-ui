# ADR-0051: Readable HTML artifact folders, without a baseline capture

Date: 2026-11-09
Status: Accepted
Supersedes: ADR-0030's UUID artifact IDs and its `baseline.html` file

## Context

ADR-0030 stores each unlinked frame (HTML iteration) under
`.nudge/artifacts/<id>/`, where the ID is a random UUID, and writes
`baseline.html` (the original capture) beside `preview.html`,
`document.html` and `metadata.json`.

A folder named by a UUID tells a person nothing, so finding the frame they
made, or the one an agent wrote, means opening folders one by one. Nothing
reads `baseline.html` any more: `preview.html` is the editing base, and the
original capture is not shown or restored anywhere.

## Decision

**A new artifact ID is a slug of the frame's title followed by a short random
suffix**, for example `pricing-page-4f3c2a1e`. The slug is lowercase ASCII
letters and digits joined by single hyphens, at most 48 characters, and falls
back to `frame` when the title has none. The suffix is 8 lowercase hex
characters. If the folder already exists, the host answers 409 and the client
retries with a new suffix.

**One validator, `isHtmlArtifactId` in `transport/artifacts.ts`, decides what
an ID is** for the host routes, the draft URL parser, saved Canvas frames and
the artifact listing. It accepts the new shape and existing UUID folders, and
nothing that could leave the artifacts folder.

**The ID is fixed when the frame is created.** Renaming a frame changes its
title, not its folder.

**Agents that write a frame themselves are told the same rules**, so a folder
they create is listed rather than silently skipped.

**The host no longer writes or serves `baseline.html`.** An artifact folder
holds `preview.html`, `document.html` and `metadata.json`.

## Consequences

- People can find a frame's folder by its name in the file system.
- Folders created before this change keep their UUID names and still load.
- Existing `baseline.html` files are left on disk and ignored.
- An agent-written folder that breaks the naming rules is not listed.
