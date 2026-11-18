# Rule: EdgeDirectionSemantic

Type: `EdgeRule`
Supports: `Any adapter`

**Summary**
- Sets or enforces a direction semantic on matched edges.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.
- `options.semantic`: Required non-empty semantic string.
- `options.overwrite`: Optional boolean to overwrite existing semantics.
- `options.enforceDirection`: Optional boolean to flip inbound edges.

**Options**
- Required. `semantic` can be any non-empty string.
- Optional defaults are available as `DefaultEdgeSemantics` from `@terra-graph/core`.

**Behavior**
- Writes `hints.semantic` on matching edges.
- If `enforceDirection` is true, inbound edges from matching nodes are reversed and updated.

**Example**
```ts
import { EdgeSemantic } from '@terra-graph/core/Graph/Rules/Edge/EdgeSemantic.js';

const rule = new EdgeSemantic({
  edge: { from: { any: true }, to: { any: true } },
  options: {
    semantic: { semantic: 'invokes', role: 'primary' },
    overwrite: false,
    enforceDirection: true,
  },
});
```
