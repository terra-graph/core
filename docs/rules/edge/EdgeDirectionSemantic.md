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
- Optional defaults are available as `DefaultEdgeDirectionSemantics` from `@terra-graph/core`.

**Behavior**
- Writes `directionSemantic` on matching edges.
- If `enforceDirection` is true, inbound edges from matching nodes are reversed and updated.

**Example**
```ts
import { EdgeDirectionSemantic } from '@terra-graph/core/Graph/Rules/Edge/EdgeDirectionSemantic.js';

const rule = new EdgeDirectionSemantic({
  edge: { from: { any: true }, to: { any: true } },
  options: { semantic: 'invokes', overwrite: false, enforceDirection: true },
});
```
