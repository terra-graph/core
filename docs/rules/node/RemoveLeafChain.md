# Rule: RemoveLeafChain

Type: `NodeRule`
Supports: `Any adapter`

**Summary**
- Removes matched leaf nodes and their removable predecessors to a fixpoint.

**Config**
- `node`: NodeQuery DSL selecting the removable scope.

**Options**
- No options.

**Behavior**
- Only nodes matched by the query are considered for removal.
- Removes leaf nodes, then repeats until no more removable nodes exist.
- Runs once per resolver execution even if multiple nodes match.

**Example**
```ts
import { RemoveLeafChain } from '@terra-graph/core/Graph/Rules/Node/RemoveLeafChain.js';

const rule = new RemoveLeafChain({
  node: { attr: { key: 'terraform.kind', eq: 'module' } },
});
```
