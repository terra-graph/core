# Rule: RemoveNode

Type: `NodeRule`
Supports: `Any adapter`

**Summary**
- Removes matched nodes from the graph.

**Config**
- `node`: NodeQuery DSL selecting nodes to remove.

**Options**
- No options.

**Behavior**
- If a node is matched, it is removed with all connected edges.

**Example**
```ts
import { RemoveNode } from '@terra-graph/core/Graph/Rules/Node/RemoveNode.js';

const rule = new RemoveNode({
  node: { attr: { key: 'terraform.kind', eq: 'module' } },
});
```
