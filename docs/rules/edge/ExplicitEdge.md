# Rule: ExplicitEdge

Type: `EdgeRule`
Supports: `Any adapter`

**Summary**
- Creates edges from matching sources to all matching targets.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.

**Options**
- No options.

**Behavior**
- Adds an edge from each matching source to each matching target.

**Example**
```ts
import { ExplicitEdge } from '@terra-graph/core/Graph/Rules/Edge/ExplicitEdge.js';

const rule = new ExplicitEdge({
  edge: {
    from: { attr: { key: 'terraform.kind', eq: 'module' } },
    to: { attr: { key: 'terraform.kind', eq: 'resource' } },
  },
});
```
