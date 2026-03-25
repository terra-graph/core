# Importers

Importers convert external formats into the canonical `TgGraph` model. This keeps the rest of the pipeline independent of Graphviz/DOT.

**TerraformDotImporter**
- Parses the output of `terraform graph` (DOT format).
- Produces a `TgGraph` with normalized node and edge attributes.

**Example**
```ts
import { TerraformDotImporter } from '@terra-graph/core/Graph/Importers/TerraformDotImporter.js';

const dot = 'digraph {\n  "a" -> "b"\n}';
const graph = new TerraformDotImporter().fromString(dot);
```
