# Rule: NodeDotProperties

Type: `NodeRule`
Supports: `DotAdapter only`

**Summary**
- Applies DOT adapter-specific attributes to matched nodes.

**Config**
- `node`: NodeQuery DSL selecting nodes.
- `options`: DOT attribute object to merge into the node adapter properties.

**Options**
- Required. Merged into `node.adapter[DotAdapter.name]`.

**Behavior**
- No-op for non-DOT adapters.
- Merges attributes without removing existing adapter values.

**Example**
```ts
import { NodeDotProperties } from '@terra-graph/core/Graph/Rules/Node/NodeDotProperties.js';

const rule = new NodeDotProperties({
  node: { nodeId: { startsWith: 'cluster_module.' } },
  options: { shape: 'box', peripheries: 2 },
});
```
