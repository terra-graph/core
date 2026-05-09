# @terra-graph/core

Core graph engine for terra-graph. This package contains the canonical graph model, importers, adapters, rule engine, runtime catalog, and renderers.

**Principles**
- `TgGraph` is the source of truth for graph data.
- Importers translate external formats into `TgGraph` (for example `TerraformDotImporter`).
- Adapters own traversal and mutation operations; they are immutable at the object level.
- Rules run through named phases in a `PhasePlan`: `pre`, `main`, `projection`, `final`.
- Profiles resolve phases, rules, and render options and are applied by `GraphResolver`.
- Renderers are selected by adapters and receive profile-defined options.
- Plugins contribute named rules, named rule sets, and phase entries without mutating registries directly.

**Installation**
```bash
npm install @terra-graph/core
# or
yarn add @terra-graph/core
```

**Quick Start**
This is a minimal programmatic example that parses Terraform DOT and renders a DOT output.

```ts
import { TerraformDotImporter } from '@terra-graph/core/Graph/Importers/TerraformDotImporter.js';
import { DotAdapter } from '@terra-graph/core/Graph/Adapters/DotAdapter.js';
import { GraphResolver } from '@terra-graph/core/Graph/GraphResolver.js';
import { Profile } from '@terra-graph/core/Graph/Profile.js';
import { DotRenderer } from '@terra-graph/core/Graph/Renderers/DotRenderer.js';

const dot = 'digraph {\n  "a" -> "b"\n}';
const graph = new TerraformDotImporter().fromString(dot);

const profile = new Profile({
  name: 'example.dot',
  supports: 'DotAdapter',
  phases: [
    { phase: 'main', rules: [] },
  ],
  render: { renderer: 'dot', options: { rankdir: 'TB' } },
});

const adapter = new DotAdapter();
const resolver = new GraphResolver(adapter);
const resolved = resolver.resolve({ graph, phases: profile.toPhases() });

const renderer = new DotRenderer({ rankdir: 'TB' });
const output = renderer.render(resolved);
console.log(output);
```

**Documentation**
- [Runtime Catalog](./docs/runtime-catalog.md)
- [Importers](./docs/importers.md)
- [Output](./docs/output.md)
- [Rules](./docs/rules/index.md)
- [NodeQuery DSL](./docs/dsl.md)

**Contributing**
- Node.js `20.19.6` is required if your default Node is older.
- Install dependencies: `yarn install`.
- Lint: `yarn lint`.
- Test: `yarn test`.
- Build: `yarn build`.

**Development Notes**
- Prefer explicit types and classes over `any` and ad-hoc functions.
- Keep new rules in explicit phases and implement `match` before `apply`.
- Treat `main` as canonical graph mutation, `projection` as projection-layer derivation/interpretation, and `final` as decoration-only work.
- Use `NodeRule` or `EdgeRule` and register concrete rules via `NodeRule.register(...)` or `EdgeRule.register(...)`.
- Use named rules and named rule sets through registries rather than ad-hoc resolution.
