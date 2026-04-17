# Rule: EdgeSemanticLegend

Type: `EdgeRule`
Supports: `Any adapter`

**Summary**
- Adds legend entries based on `directionSemantic` values.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.
- `options.legendBySemantic`: Map of semantic value to `{ title, colour }`.
- `options.overwrite`: Optional boolean to overwrite existing legends.

**Options**
- Required. `legendBySemantic` keys must be non-empty strings.
- Optional defaults are available as `DefaultEdgeDirectionSemantics` from `@terra-graph/core`.

**Behavior**
- Only applies to edges that already have a `directionSemantic`.
- Optionally overwrites existing `legend` values.

**Example**
```ts
import { EdgeSemanticLegend } from '@terra-graph/core/Graph/Rules/Edge/EdgeSemanticLegend.js';

const rule = new EdgeSemanticLegend({
  edge: { from: { any: true }, to: { any: true } },
  options: {
    legendBySemantic: {
      invokes: { title: 'Invokes', colour: '#ff9900' },
    },
  },
});
```
