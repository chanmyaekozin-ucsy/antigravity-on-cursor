# Verification Standard

## Choose evidence by risk

| Change | Minimum evidence |
|---|---|
| Pure explanation | Direct source references or reproducible facts |
| Small logic fix | Regression test plus affected test suite |
| API/serialization | Contract tests for success, validation, errors, and streaming if used |
| UI behavior | Build/typecheck plus interaction or rendered-state check |
| Authentication/security | Positive and negative authorization tests; secret/log review |
| Concurrency/retry | Deterministic tests for ordering, cancellation, duplication, and cleanup |
| Performance | Repeatable baseline and after measurement |
| Deployment/config | Parser/config validation and realistic startup or smoke check |
| Dependency change | Lockfile inspection, tests/build, and vulnerability/advisory check |

## Test quality

- Assert observable behavior, not private implementation details.
- Make the test fail when the bug or missing behavior is restored.
- Cover one happy path and the highest-risk boundary cases.
- Avoid flaky timing, live network dependencies, and shared mutable state unless they are the subject of the test.
- Prefer focused fixtures over giant snapshots. Review snapshots and generated output explicitly.
- Do not replace meaningful assertions with “does not throw.”

## Verification order

1. Syntax or parser validation.
2. Test nearest the changed behavior.
3. Affected module/package suite.
4. Typecheck and lint where configured.
5. Production build.
6. Integration, browser, server startup, container, or deployment smoke check when relevant.
7. Final `git diff --check`, status inspection, and diff review.

If a check cannot run, state the exact command, reason, and what remains unverified. Never describe an unrun check as passing.

## Completion report

Lead with what now works. Then include:

- Important implementation decisions and user-visible changes.
- Exact checks run and their outcomes.
- Breaking configuration or migration steps.
- Remaining limitations only when concrete and relevant.

Avoid a file-by-file diary, inflated confidence, and generic praise.
