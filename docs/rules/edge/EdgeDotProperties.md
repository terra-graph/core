# Rule: EdgeDotProperties

Type: `EdgeRule`
Supports: `DotAdapter only`

**Summary**
- Applies DOT adapter-specific attributes to matched edges.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.
- `options`: DOT attribute object to merge into the edge adapter properties.

**Options**
- Required. Merged into `edge.adapter[DotAdapter.name]`.

**Behavior**
- No-op for non-DOT adapters.
- Merges attributes without removing existing adapter values.

**Example**
```ts
import { EdgeDotProperties } from '@terra-graph/core/Graph/Rules/Edge/EdgeDotProperties.js';

const rule = new EdgeDotProperties({
  edge: { from: { any: true }, to: { any: true } },
  options: { color: 'gray50', style: 'dashed' },
});
```
