# Core graph engine

## Ownership

Own canonical graph contracts, runtime loading, profile execution, rules, adapters, and rendering. Cloud project/snapshot persistence belongs to cloud consumers. Preserve the pre/main/projection/final phase boundaries.

## Setup and verification

The documented development baseline is Node `24.22.3`; select it explicitly with nvm. Use Yarn `1.22.22`. CI and release workflows use the tracked `.nvmrc` baseline.

Install dependencies with `yarn install --frozen-lockfile`.

Run these checks from this repository: `yarn lint:ci`, `yarn test`, `yarn build:ci`. `yarn lint` and `yarn lint:ci` are read-only. Use `yarn format` for explicit formatting writes. Never publish or run live model/database workloads as part of ordinary unit-test verification.

## Common coding policy

Keep this policy synchronized with the workspace AGENTS.md when working in the assembled workspace. This repository's instructions also apply to standalone clones.

- Identify affected consumers before editing; prefer small changes and preserve pre-existing work.
- Prefer classes for domain services and interchangeable implementations. Use explicit types rather than any and strict serializable configuration shapes.
- Keep each interface and supporting types in its named module; implementations belong in a sibling directory named after that contract. Prefer one named class export per module.
- Do not import from index.ts/index.js files.
- Colocate new `.test.ts` or `.test.tsx` files; retain legacy test locations unless relocation belongs to the task. Describe public class methods as `ClassName.methodName`, and functions/components by public name. Preserve existing `shoud` test naming where used.
- Preserve agreed contracts when documentation and implementation differ; report unresolved conflicts. Keep proposals and future work separate from current guidance.

## Verification entry point

Use `yarn verify` for complete verification on Node `24.22.3`. It runs lint, no-emit type checking, a clean build, tests, and isolated packaged-consumer checks. `yarn lint` and `yarn lint:ci` never rewrite files; `yarn format` does. Verification must leave tracked files unchanged. Preserve existing lint coverage and do not weaken checks to make a release pass. See README.md for the staged registry dependency rollout where applicable.
