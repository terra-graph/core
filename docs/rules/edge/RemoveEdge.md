# Rule: RemoveEdge

Type: `EdgeRule`
Supports: `Any adapter`

**Summary**
- Removes matched edges.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.

**Options**
- No options.

**Behavior**
- Removes each edge from matching sources to matching targets.

**Example**
```ts
import { RemoveEdge } from '@terra-graph/core/Graph/Rules/Edge/RemoveEdge.js';

const rule = new RemoveEdge({
  edge: { from: { any: true }, to: { attr: { key: 'terraform.kind', eq: 'data' } } },
});
```
