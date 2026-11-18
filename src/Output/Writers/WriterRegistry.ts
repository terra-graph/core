import { ArtifactWriter } from '../ArtifactWriter.js';

export type WriterFactoryInput = {
  options?: Record<string, unknown>;
};

export type WriterFactory = (input: WriterFactoryInput) => ArtifactWriter;

export class WriterRegistry {
  private readonly writers: Record<string, WriterFactory>;

  constructor(writers: Record<string, WriterFactory> = {}) {
    this.writers = WriterRegistry.normalizeRegistry(writers);
  }

  public resolve(
    name: string,
    options?: Record<string, unknown>,
  ): ArtifactWriter {
    const key = WriterRegistry.normalizeName(name);
    const factory = this.writers[key];
    if (!factory) {
      const available = Object.keys(this.writers).sort().join(', ');
      const suffix = available ? ` Available: ${available}.` : '';
      throw new Error(`Writer '${name}' is not registered.${suffix}`);
    }

    return factory({ options });
  }

  public list(): string[] {
    return Object.keys(this.writers).sort();
  }

  public use(registry: WriterRegistry): WriterRegistry {
    return new WriterRegistry({
      ...this.writers,
      ...registry.writers,
    });
  }

  private static normalizeRegistry(
    writers: Record<string, WriterFactory>,
  ): Record<string, WriterFactory> {
    const normalized: Record<string, WriterFactory> = {};
    for (const [name, factory] of Object.entries(writers)) {
      normalized[WriterRegistry.normalizeName(name)] = factory;
    }
    return normalized;
  }

  private static normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }
}
