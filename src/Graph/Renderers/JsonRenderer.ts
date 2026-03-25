import { Adapter } from '../Adapter.js';
import { RenderArtifact, Renderer } from '../Renderer.js';

export class JsonRenderer<TAdapter extends Adapter = Adapter>
  implements Renderer<TAdapter>
{
  public render(adapter: TAdapter): RenderArtifact {
    return {
      content: JSON.stringify(adapter.toTgGraph()),
      mediaType: 'application/json',
      extension: 'json',
    };
  }
}
