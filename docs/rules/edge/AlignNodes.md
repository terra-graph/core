# Rule: AlignNodes

Type: `EdgeRule`
Supports: `DotAdapter only`

**Summary**
- Aligns matched nodes on the same DOT rank.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.

**Options**
- No options.

**Behavior**
- Collects edges from matching sources to matching targets.
- Adds a `rank=same` block for the collected nodes.

**Example**
```ts
import { AlignNodes } from '@terra-graph/core/Graph/Rules/Edge/AlignNodes.js';

const rule = new AlignNodes({
  edge: {
    from: { attr: { key: 'terraform.kind', eq: 'module' } },
    to: { attr: { key: 'terraform.kind', eq: 'module' } },
  },
});
```
