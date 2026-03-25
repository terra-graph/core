# Rule: ConvertNodeToEdge

Type: `NodeRule`
Supports: `Any adapter`

**Summary**
- Converts a matched node into a direct edge when it has exactly one inbound and one outbound edge.

**Config**
- `node`: NodeQuery DSL selecting the node to convert.

**Options**
- No options.

**Behavior**
- Requires exactly one inbound edge and one outbound edge.
- Removes the node and the two edges, then creates a new edge from the inbound source to the outbound target.
- Adds `renderHints` derived from the node `terraform.resource` and `terraform.name` when available.

**Example**
```ts
import { ConvertNodeToEdge } from '@terra-graph/core/Graph/Rules/Node/ConvertNodeToEdge.js';

const rule = new ConvertNodeToEdge({
  node: { attr: { key: 'terraform.kind', eq: 'resource' } },
});
```
