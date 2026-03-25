# Rule: NodeProperties

Type: `NodeRule`
Supports: `Any adapter`

**Summary**
- Deep-merges arbitrary properties into matched node attributes.

**Config**
- `node`: NodeQuery DSL selecting nodes.
- `options`: Object merged into the node attributes.

**Options**
- Required. Supports value references like `{ from: "nodeId" }` or `{ from: "terraform.name" }`.

**Behavior**
- Resolves value references recursively in objects and arrays.
- Performs a deep merge into existing node attributes.

**Example**
```ts
import { NodeProperties } from '@terra-graph/core/Graph/Rules/Node/NodeProperties.js';

const rule = new NodeProperties({
  node: { any: true },
  options: { label: { from: 'terraform.name' } },
});
```
