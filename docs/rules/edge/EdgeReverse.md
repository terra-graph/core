# Rule: EdgeReverse

Type: `EdgeRule`
Supports: `Any adapter`

**Summary**
- Reverses matched edges so they point away from the current node.

**Config**
- `edge.from`: NodeQuery DSL for current node.
- `edge.to`: NodeQuery DSL for source nodes to reverse.

**Options**
- No options.

**Behavior**
- Reverses inbound edges whose source matches `edge.to`.

**Example**
```ts
import { EdgeReverse } from '@terra-graph/core/Graph/Rules/Edge/EdgeReverse.js';

const rule = new EdgeReverse({
  edge: { from: { any: true }, to: { attr: { key: 'terraform.kind', eq: 'data' } } },
});
```
