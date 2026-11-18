# Output

The output layer renders a resolved graph and optionally transforms or writes the result.

**Key Types**
- `RenderPipeline` executes render, transform, and write steps.
- `ArtifactWriter` writes outputs (for example file or stdout writers).
- `ArtifactTransformer` post-processes rendered output.
- `ArtifactTransformerFactory` builds transformer instances from config.

**Example**
```ts
import { RenderPipeline } from '@terra-graph/core/Output/RenderPipeline.js';
import { StdoutArtifactWriter } from '@terra-graph/core/Output/ArtifactWriter/StdoutArtifactWriter.js';

const pipeline = new RenderPipeline();

await pipeline.execute({
  artifact: 'rendered-output',
  writer: new StdoutArtifactWriter(),
  write: { mode: 'stdout' },
  transformers: [],
});
```
