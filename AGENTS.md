# Core graph engine

## Ownership

Own canonical graph contracts, runtime loading, profile execution, rules, adapters, and rendering. Cloud project/snapshot persistence belongs to cloud consumers. Preserve the pre/main/projection/final phase boundaries.

## Setup and verification

The documented development baseline is Node `20.19.6`; select it explicitly with nvm. Use Yarn `1.22.22`. CI compatibility matrices and release tooling may use other Node versions as declared in workflows.

Install dependencies with `yarn install --frozen-lockfile`.

Run these checks from this repository: `yarn lint:ci`, `yarn test`, `yarn build:ci`. `yarn lint:ci` is non-mutating where provided; `yarn lint` may apply fixes, so inspect its diff. Never publish or run live model/database workloads as part of ordinary unit-test verification.

## Common coding policy

Keep this policy synchronized with the workspace AGENTS.md when working in the assembled workspace. This repository's instructions also apply to standalone clones.

- Identify affected consumers before editing; prefer small changes and preserve pre-existing work.
- Prefer classes for domain services and interchangeable implementations. Use explicit types rather than any and strict serializable configuration shapes.
- Keep each interface and supporting types in its named module; implementations belong in a sibling directory named after that contract. Prefer one named class export per module.
- Do not import from index.ts/index.js files.
- Colocate new `.test.ts` or `.test.tsx` files; retain legacy test locations unless relocation belongs to the task. Describe public class methods as `ClassName.methodName`, and functions/components by public name. Preserve existing `shoud` test naming where used.
- Preserve agreed contracts when documentation and implementation differ; report unresolved conflicts. Keep proposals and future work separate from current guidance.
