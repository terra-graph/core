import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../Adapters/GraphologyAdapter.js';
import { JsonRenderer } from './JsonRenderer.js';
import { RendererRegistry } from './RendererRegistry.js';

describe('RendererRegistry.resolve', () => {
  it('shoud normalize names and resolve factories', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());
    const factory = jest.fn(() => new JsonRenderer());

    const registry = new RendererRegistry({ ' JSON ': factory });

    const renderer = registry.resolve('json', adapter, { pretty: true });

    expect(factory).toHaveBeenCalledWith({
      adapter,
      options: { pretty: true },
    });
    expect(renderer).toBeInstanceOf(JsonRenderer);
  });

  it('shoud include available renderers in errors', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());
    const registry = new RendererRegistry({ Json: () => new JsonRenderer() });

    expect(() => registry.resolve('missing', adapter)).toThrow(
      "Renderer 'missing' is not registered. Available: json.",
    );
  });

  it('shoud omit available renderers when none are registered', () => {
    const adapter = new GraphologyAdapter(new DirectedGraph());
    const registry = new RendererRegistry();

    expect(() => registry.resolve('missing', adapter)).toThrow(
      "Renderer 'missing' is not registered.",
    );
  });
});

describe('RendererRegistry.list', () => {
  it('shoud return sorted renderer names', () => {
    const registry = new RendererRegistry({
      Delta: () => new JsonRenderer(),
      alpha: () => new JsonRenderer(),
      Bravo: () => new JsonRenderer(),
    });

    expect(registry.list()).toEqual(['alpha', 'bravo', 'delta']);
  });
});
