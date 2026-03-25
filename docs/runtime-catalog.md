# Runtime Catalog

The runtime catalog is the top-level registry used to resolve profiles, rules, rule sets, and plugins into executable phases.

**Key Concepts**
- `RuntimeCatalog` holds four registries: named rules, named rule sets, profiles, and plugins.
- Registries are immutable; `use(...)` returns a new catalog with merged registries.
- `RuntimeCatalog.from([...])` composes multiple providers into one catalog.

**Core APIs**
- `resolveProfile(name)` returns a `Profile` by name.
- `resolveProfilePhases(name)` returns the resolved `BaseRule[][]` for execution.
- `resolveProfileRendererOptions(name)` returns renderer options from the profile chain.
- `resolveProfileRenderer(name)` returns the renderer id from the profile.

**Example**
```ts
import { RuntimeCatalog } from '@terra-graph/core/Runtime/RuntimeCatalog.js';
import { NamedRuleRegistry } from '@terra-graph/core/Graph/Rules/NamedRuleRegistry.js';
import { ProfileRegistry } from '@terra-graph/core/Graph/ProfileRegistry.js';

const catalog = RuntimeCatalog.from([
  { namedRules: new NamedRuleRegistry() },
  { profiles: new ProfileRegistry() },
]);

const phases = catalog.resolveProfilePhases('my.profile');
```
