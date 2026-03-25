import { Adapter } from './Adapter.js';

export type RenderArtifact = {
  content: string | Uint8Array;
  mediaType: string;
  extension?: string;
};

export interface Renderer<TAdapter extends Adapter> {
  render(adapter: TAdapter): RenderArtifact;
}
