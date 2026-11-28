# Core graph engine

## Task workspaces and branches

- Conventional commit scopes are optional. When a scope is provided, retain any repository-specific allowed-scope rules and all other commitlint checks.
- Start each new change in a dedicated Git worktree on a task branch based on freshly fetched `origin/main`. This applies to implementation, documentation, maintenance and configuration. Reuse the same worktree for follow-ups on the same task; independent tasks need separate worktrees. Never change files on main or switch another task's checkout.
- In the assembled TerraGraph workspace, identify affected repositories from the workspace root and use its `scripts/task-workspace` command to create the task workspace or add this repository. The root workspace instructions and task-workspace skill describe that setup. Do not require the private workspace when working in a standalone clone.
- For a standalone clone, run `git fetch origin`, then `git worktree add --no-track -b <task-branch> <separate-task-path> origin/main`. Read the new checkout's instructions and continue there using explicit working directories and file paths. Creating the worktree is part of the requested change; no separate routine confirmation is needed.
- A shell directory change does not rebind VS Code, agent instructions or sandbox permissions. Map original editor file references to the task checkout before editing. Preserve existing changes and do not share writable source, dependencies or build output through symlinks. Use normal narrowly scoped permission requests if access is blocked.
- Before handoff or push, inspect `git branch -vv` in each affected repository. Unpublished task branches have no upstream; published branches track the matching branch on the intended remote. Remove accidental base-branch tracking with `git branch --unset-upstream`. For a first authorized push, use `git push --set-upstream origin <task-branch>`. Do not push or remove task worktrees without authorization.

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
