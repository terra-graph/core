# Rule: EdgeLegend

Type: `EdgeRule`
Supports: `Any adapter`

**Summary**
- Adds a legend entry to matched edges.

**Config**
- `edge.from`: NodeQuery DSL for source nodes.
- `edge.to`: NodeQuery DSL for target nodes.
- `options.title`: Legend label.
- `options.colour`: Legend color value.

**Options**
- Required. `title` and `colour` must be strings.

**Behavior**
- Writes `legend` metadata on edges that match the query.

**Example**
```ts
import { EdgeLegend } from '@terra-graph/core/Graph/Rules/Edge/EdgeLegend.js';

const rule = new EdgeLegend({
  edge: { from: { any: true }, to: { any: true } },
  options: { title: 'Depends On', colour: '#888888' },
});
```
