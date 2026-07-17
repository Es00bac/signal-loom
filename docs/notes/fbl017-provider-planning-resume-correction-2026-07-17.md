# FBL-017 provider planning and resume correction — 2026-07-17

## Scope

This correction reconciles final-cost approval with the provider requests that
the frozen Flow graph can actually dispatch, including passive Envelope routes,
multiple independent fan-out axes, and bounded Source Library resume checks. It
also keeps edit, cancel, reset, and ownership behavior exact while the final
confirmation is open. No provider adapter or unrelated workspace behavior was
changed.

## Behavior

- Planning projects provider output cardinality into routed Envelope items and
  lets the normal execution planner calculate paired, broadcast, and Cartesian
  axes. A direct scalar dependency remains scalar.
- The approved plan records provider-call cardinality and Source resume proofs;
  execution must match both before dispatch.
- A changed resumable HTTP source causes one fresh re-plan and confirmation. The
  stable second identity is then handed off; partial and full reads are not
  duplicated indefinitely.
- Planning ownership begins before asynchronous confirmation. Edits invalidate
  and re-plan only during the permitted confirmation window; cancel/reset still
  settle the graph owner and release retained resume resources exactly once.

## Verification

- Exact cardinality regressions pass for direct scalar (3 total provider calls),
  one passive Envelope axis (4), and two independent axes (20).
- Flow planning, ownership, cancellation, resume, cost, production-matrix, and
  verifier coverage passed (342 production checks in the implementation gate;
  196 focused checks in an independent read-only gate).
- Fresh nonincremental app and node TypeScript checks, changed-file ESLint, and
  `git diff --check` passed after correcting the test telemetry fixture.

## Residual boundary

The projection is deliberately bounded by declared model output counts and
graph iteration limits. Provider-side variance beyond those contracts remains a
provider-adapter concern and is not silently authorized by this change.
