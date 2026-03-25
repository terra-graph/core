# Rule: RemoveNodeAndReconnectEdges

Type: `NodeRule`
Supports: `Any adapter`

**Summary**
- Removes matched nodes and reconnects their inbound and outbound edges.

**Config**
- `node`: NodeQuery DSL selecting nodes to remove.

**Options**
- No options.

**Behavior**
- Creates new edges between all inbound and outbound neighbors.
- Chooses loop order based on in/out counts to reduce operations.

**Example**
```ts
import { RemoveNodeAndReconnectEdges } from '@terra-graph/core/Graph/Rules/Node/RemoveNodeAndReconnectEdges.js';

const rule = new RemoveNodeAndReconnectEdges({
  node: { attr: { key: 'terraform.resource', eq: 'time_sleep' } },
});
```
