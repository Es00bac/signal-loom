# AUD-030 supported-route policy-matrix correction

Date: 2026-07-18

## Scope and baseline

- Branch: `audit/aud030-provider-start-scheduler-20260718`
- Reviewed clean baseline: `632f6c487c897dd2cbaec88ee6b3a8785d44b8e1`
- Correction production/tests commit: `46559c4a`
- Finding: AUD-030 from `docs/audits/codebase-correctness-audit-2026-07-16.md`

Independent review of the initial scheduler correction found a policy-registration gap. With backend proxy mode configured, the resolver could return `backend-proxy:local`, `backend-proxy:localOpen`, or `backend-proxy:android`, but none of those keys was registered. All three therefore received the fallback `default` limiter object and could couple otherwise unrelated routes.

## Execution-route correction

The corrected routing follows the execution requirements already present in the application and proxy DTO:

- Prompt-mode text only returns its saved text. Explicit prompt mode and the legacy omitted-mode default now remain on-device under the zero-delay `local` policy instead of being submitted to the provider proxy.
- Android image generation needs the paired device address and token. Those fields are deliberately withheld from the proxy DTO, so Android generation remains on-device under the zero-delay `android` policy even when remote provider proxying is configured.
- Local/Open is intentionally proxy-capable. Its sanitized endpoint URL and selected model are explicitly included in the proxy execution DTO, while any proxy-side credential configuration remains owned by the proxy service. It therefore receives its own registered `backend-proxy:localOpen` zero-delay policy.
- Generated text, the remaining image providers, video, audio, and Vision Verify retain their existing provider-specific proxy policies. Crop remains local. Composition, API Requester, and reusable Function orchestration still bypass provider admission before policy resolution.

`PROVIDER_START_POLICY_MIN_DELAYS_MS` is now the single explicit declaration of supported policy keys and delays. Every entry is used to construct a new `ProviderRateLimiter`; no two declared policies share one instance. Unknown external lookup strings may still receive `default`, but no supported Flow execution route does.

## Permanent route matrix

The scheduler test now exercises direct and proxy-configured policy resolution for:

- explicit and omitted-default prompt text;
- omitted-default and all Gemini/OpenAI/Hugging Face generated-text providers;
- omitted-default and all nine image providers;
- omitted-default and all three video providers;
- omitted-default and all three audio providers;
- Vision Verify and local crop.

For every matrix cell, the test proves that the expected policy is registered, resolves to that exact limiter object, does not use `default`, and remains distinct from every other used policy. A second declaration-level test proves that every registered key has its own limiter object and exact configured delay.

Execution-level checks additionally prove that:

- prompt pass-through performs no network request in proxy mode;
- Android generation calls only the paired device capability and generation routes in proxy mode;
- Local/Open calls the configured provider proxy once and forwards its sanitized endpoint through the proxy DTO.

## Validation

Focused scheduler and route checks:

```text
Test Files  2 passed (2)
Tests       8 passed (8)
```

Adjacent Flow execution checks:

```text
Test Files  21 passed (21)
Tests       253 passed (253)
```

Adjacent proxy, scheduling, usage, cost, and project-billing checks:

```text
Test Files  9 passed (9)
Tests       112 passed (112)
```

Flow production verification:

```text
Test Files  9 passed (9)
Tests       375 passed (375)
Flow production audit passed: 63 nodes, 182 model contracts, 178 normal model options.
```

Additional gates:

```text
npx tsc -p tsconfig.app.json --noEmit --incremental false --pretty false
exit 0

npx tsc -p tsconfig.node.json --noEmit --incremental false --pretty false
exit 0

npx eslint src/lib/flowExecution.ts src/lib/flowExecutionProviderScheduling.test.ts src/lib/providerRateLimiter.ts src/lib/providerRateLimiter.test.ts
exit 0

git diff --check
exit 0

npx vite build --configLoader=runner
3282 modules transformed; built in 2.34s; exit 0
```

The production build emitted only the repository's existing browser externalization, runtime URL, and large-chunk warnings.

## Review state

- This is correction-author evidence, not independent approval.
- Fresh independent review of the exact clean correction head remains mandatory before integration or audit closure.
- No integration or closure is claimed here.
