import { AdapterOperations } from '../Operations/Operations.js';
import { Renderer } from '../Renderer.js';

export type RendererFactoryInput = {
  adapter: AdapterOperations;
  options?: Record<string, unknown>;
};

export type RendererFactory = (
  input: RendererFactoryInput,
) => Renderer<AdapterOperations>;

export class RendererRegistry {
  private readonly renderers: Record<string, RendererFactory>;

  constructor(renderers: Record<string, RendererFactory> = {}) {
    this.renderers = RendererRegistry.normalizeRegistry(renderers);
  }

  public resolve(
    name: string,
    adapter: AdapterOperations,
    options?: Record<string, unknown>,
  ): Renderer<AdapterOperations> {
    const key = RendererRegistry.normalizeName(name);
    const factory = this.renderers[key];
    if (!factory) {
      const available = Object.keys(this.renderers).sort().join(', ');
      const suffix = available ? ` Available: ${available}.` : '';
      throw new Error(`Renderer '${name}' is not registered.${suffix}`);
    }

    return factory({ adapter, options });
  }

  public list(): string[] {
    return Object.keys(this.renderers).sort();
  }

  private static normalizeRegistry(
    renderers: Record<string, RendererFactory>,
  ): Record<string, RendererFactory> {
    const normalized: Record<string, RendererFactory> = {};
    for (const [name, factory] of Object.entries(renderers)) {
      normalized[RendererRegistry.normalizeName(name)] = factory;
    }
    return normalized;
  }

  private static normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }
}
