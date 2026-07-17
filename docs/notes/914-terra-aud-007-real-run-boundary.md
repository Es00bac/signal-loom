# Terra AUD-007 real run boundary repair — 2026-07-16

This follow-up repairs the remaining collapsed Function execution gaps at the
real Flow execution boundary.

- Function input bindings now resolve flow values, constants, expressions,
  missing strategies, and transforms before preparing the internal graph.
- Named Function outputs are retained by declared output-port id, rather than
  collapsing all downstream source handles to the primary result. Runtime media
  metadata is retained with each named result.
- Internal Function plans validate paid-provider credentials and persisted
  wiring before any provider call. Malformed paid wiring and invalid bindings
  fail closed; provider-free missing-output fallbacks retain their documented
  local behavior.
- Internal provider telemetry is attributed immediately to its internal node,
  provider, and model through the immutable outer Flow run context. A later
  Function failure or cancellation cannot erase completed spend, and the outer
  aggregate is not double-booked.
- The run confirmation is combined into one pre-provider boundary and Function
  cost estimation includes runnable internal providers. Cached dependency reuse
  now compares a stored input signature, so changing a bound Function input
  requires fresh execution while unchanged inputs may intentionally reuse.
- The outer abort signal reaches Stability's in-flight fetch. The release
  workflow stages and verifies the managed font library before electron-builder
  on every desktop runner.

Focused regressions cover fresh internal provider execution, constants with
transforms, named outputs, missing-key fail-closed behavior, malformed wiring,
abort forwarding, provider-chain usage, and release workflow ordering.

Residuals: non-fetch SDK provider clients that do not expose an abort option
remain governed by their own provider adapters; the executor now forwards the
run signal wherever the direct request boundary accepts it. Function nested
graphs remain depth-limited and must pass the same preflight before work starts.
