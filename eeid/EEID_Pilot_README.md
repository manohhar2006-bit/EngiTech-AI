# EEID Pilot Repository Manifest

This folder describes the first three public GitHub repositories selected for the EngiTrace Engineering Intelligence Dataset (EEID) pilot.

## Files

- `eeid_pilot_repositories.jsonl`: One repository manifest record per line.
- This README: Scope, provenance and collection notes.

## Fixed snapshots

| Repository | Default branch | Commit SHA | License |
|---|---|---|---|
| expressjs/express | master | `43fca52d28a422c8be48fd489cbd4f2d6152bab6` | MIT |
| TanStack/query | main | `19f555cf919a1438885d7d20c95b17b26d6d6859` | MIT |
| payloadcms/payload | main | `90b4962a1876cbd3568692e7de9aaf72b847e407` | MIT |

## Important status

The repository metadata, selected commit objects, package manifests, license files and scoped Git trees have been checked through GitHub access.

**This is a repository manifest and collection plan, not yet a completed source-code/AST/graph snapshot.** AST analysis, graph export, source content materialization and EEID annotations have not been run or produced yet.

A local `git clone` attempt from the current working environment failed because the shell could not resolve `github.com`. The user's development machine or the EngiTrace backend collector can perform the actual repository download and parsing.

## Collection limits

The existing EngiTrace handover describes a retrieval cap of up to 60 prioritized source files. The Payload monorepo therefore needs an explicit deterministic source-file allowlist; do not claim the full monorepo was analyzed.

## Licensing and provenance

All three selected repositories expose MIT license files at the pinned snapshots. Preserve the applicable license and copyright notices whenever retaining or redistributing substantial source excerpts. Record repository URL, commit SHA, file path, blob SHA/content hash and collection time for each retained source artifact. Review third-party assets and files with separate notices individually.

## Next implementation step

Run the existing EngiTrace ingestion and AST/graph pipeline against these exact commit SHAs. Export the resulting snapshot artifacts and coverage report before creating gold question-answer records.
