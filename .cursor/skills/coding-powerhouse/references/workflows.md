# Engineering Workflows

Load only the section matching the task.

## Feature implementation

1. Trace the entry point, state ownership, public contract, and downstream consumers.
2. Find the nearest established implementation and tests; reuse its conventions.
3. Define acceptance behavior, including failure and empty states.
4. Implement a vertical slice rather than disconnected scaffolding.
5. Add tests at the lowest layer that proves the behavior, plus an integration check when boundaries change.
6. Exercise the real user path when practical.

## Bug fixing

1. Reproduce the symptom or identify the exact failing branch from evidence.
2. Trace backward from failure to the first incorrect state transition or assumption.
3. Write a regression test that fails for the original reason.
4. Fix the root cause without masking errors or broadly swallowing exceptions.
5. Test nearby variants, retry paths, cleanup, and previous successful behavior.

## Refactoring

1. Establish behavior-preserving tests before structural edits.
2. Name the concrete problem: duplication, coupling, unclear ownership, unsafe state, or poor extensibility.
3. Move in small compilable steps and keep public contracts stable.
4. Avoid mixing broad formatting or unrelated feature changes into the refactor.
5. Compare behavior and relevant performance before and after.

## Code review

1. Read the request, diff, and relevant surrounding code—not just changed lines.
2. Follow inputs across trust and state boundaries.
3. Check error paths, cancellation, cleanup, retries, concurrency, and backward compatibility.
4. Verify tests would fail without the change and cover the risky branch.
5. Report only actionable findings with severity, exact location, causal explanation, and a concrete fix direction.
6. If no actionable findings exist, say so and name residual verification gaps.

## Performance optimization

1. Capture a baseline representative of production behavior.
2. Identify whether cost is CPU, memory, I/O, network, rendering, allocation, contention, or algorithmic growth.
3. Change one dominant factor at a time.
4. Preserve correctness under realistic data sizes and concurrency.
5. Report before/after measurements and measurement conditions.

## Dependency or platform migration

1. Read official migration documentation and installed-version constraints.
2. Inventory impacted APIs, configuration, generated files, runtime requirements, and deployment images.
3. Upgrade in reviewable stages when possible.
4. Run compatibility checks and inspect lockfile/generated changes.
5. Document operator actions, rollback considerations, and intentional breaking changes.

## Build or CI failure

1. Run the smallest failing command locally.
2. Identify the first meaningful error; later failures may be cascading noise.
3. Compare local and CI runtime, environment variables, paths, caches, architecture, and dependency resolution.
4. Fix deterministic configuration before adding retries.
5. Re-run the exact failing command, then the broader pipeline.
