import { ArtifactWriteInput, ArtifactWriter } from '../ArtifactWriter.js';
import { StdoutArtifactWriter } from '../ArtifactWriter/StdoutArtifactWriter.js';
import { WriterRegistry } from './WriterRegistry.js';

class CaptureWriter implements ArtifactWriter {
  public constructor(public readonly id: string) {}

  public async write(_input: ArtifactWriteInput): Promise<void> {}
}

describe('WriterRegistry.resolve', () => {
  it('shoud normalize names and resolve factories', () => {
    const factory = jest.fn(() => new StdoutArtifactWriter());
    const registry = new WriterRegistry({ ' STDOUT ': factory });

    const writer = registry.resolve('stdout', { flush: true });

    expect(factory).toHaveBeenCalledWith({
      options: { flush: true },
    });
    expect(writer).toBeInstanceOf(StdoutArtifactWriter);
  });

  it('shoud include available writers in errors', () => {
    const registry = new WriterRegistry({
      File: () => new CaptureWriter('file'),
    });

    expect(() => registry.resolve('missing')).toThrow(
      "Writer 'missing' is not registered. Available: file.",
    );
  });

  it('shoud omit available writers when none are registered', () => {
    const registry = new WriterRegistry();

    expect(() => registry.resolve('missing')).toThrow(
      "Writer 'missing' is not registered.",
    );
  });
});

describe('WriterRegistry.list', () => {
  it('shoud return sorted writer names', () => {
    const registry = new WriterRegistry({
      Delta: () => new StdoutArtifactWriter(),
      alpha: () => new StdoutArtifactWriter(),
      Bravo: () => new StdoutArtifactWriter(),
    });

    expect(registry.list()).toEqual(['alpha', 'bravo', 'delta']);
  });
});

describe('WriterRegistry.use', () => {
  it('shoud prefer later writer factories when names collide', async () => {
    const base = new WriterRegistry({
      shared: () => new CaptureWriter('first'),
    });
    const next = new WriterRegistry({
      shared: () => new CaptureWriter('second'),
    });

    const writer = base.use(next).resolve('shared');
    expect(writer).toBeInstanceOf(CaptureWriter);
    expect((writer as CaptureWriter).id).toBe('second');
  });
});
