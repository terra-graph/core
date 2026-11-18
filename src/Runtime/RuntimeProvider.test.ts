import { RendererRegistry } from '../Graph/Renderers/RendererRegistry.js';
import { WriterRegistry } from '../Output/Writers/WriterRegistry.js';
import { RuntimeProvider } from './RuntimeProvider.js';

describe('RuntimeProvider', () => {
  it('shoud allow catalog and adapter contributions in one object', () => {
    const provider: RuntimeProvider = {
      renderers: new RendererRegistry(),
      writers: new WriterRegistry(),
      supportedAdapterOperationsRegistry: {},
    };

    expect(provider).toEqual({
      renderers: expect.any(RendererRegistry),
      writers: expect.any(WriterRegistry),
      supportedAdapterOperationsRegistry: {},
    });
  });
});
