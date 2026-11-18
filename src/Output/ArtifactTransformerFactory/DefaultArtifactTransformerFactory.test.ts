import { DotCliRunProcessInput } from '../ArtifactTransformer/DotCliArtifactTransformer.js';
import { DefaultArtifactTransformerFactory } from './DefaultArtifactTransformerFactory.js';

describe('DefaultArtifactTransformerFactory.create', () => {
  it('shoud create dotcli transformer with mapped options', async () => {
    const calls: DotCliRunProcessInput[] = [];
    const factory = new DefaultArtifactTransformerFactory({
      dotCliRunProcess: async (input) => {
        calls.push(input);
        return Buffer.from([1, 2, 3]);
      },
    });

    const transformer = factory.create({
      name: 'dotcli',
      options: {
        format: 'png',
        executable: 'dot-custom',
        dotArg: ['-Nshape=box', '-Ecolor=red'],
        Gdpi: '200',
      },
    });

    await transformer.transform({
      artifact: {
        content: 'digraph G {}',
        mediaType: 'text/vnd.graphviz',
        extension: 'dot',
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      executable: 'dot-custom',
      args: ['-Tpng', '-Nshape=box', '-Ecolor=red', '-Gdpi=200'],
      stdin: 'digraph G {}',
    });
  });

  it('shoud throw when transformer is not supported', () => {
    const factory = new DefaultArtifactTransformerFactory();

    expect(() =>
      factory.create({
        name: 'unknown',
      }),
    ).toThrow("Unsupported transformer 'unknown'");
  });

  it('shoud require format for dotcli', () => {
    const factory = new DefaultArtifactTransformerFactory();

    expect(() =>
      factory.create({
        name: 'dotcli',
      }),
    ).toThrow("Transformer 'dotcli' requires option 'format'");
  });

  it('shoud default to dot executable when none is provided', async () => {
    const calls: DotCliRunProcessInput[] = [];
    const factory = new DefaultArtifactTransformerFactory({
      dotCliRunProcess: async (input) => {
        calls.push(input);
        return Buffer.from([4, 5, 6]);
      },
    });

    const transformer = factory.create({
      name: 'dotcli',
      options: {
        format: 'svg',
      },
    });

    await transformer.transform({
      artifact: {
        content: 'digraph G {}',
        mediaType: 'text/vnd.graphviz',
        extension: 'dot',
      },
    });

    expect(calls[0]).toEqual({
      executable: 'dot',
      args: ['-Tsvg'],
      stdin: 'digraph G {}',
    });
  });

  it('shoud return empty dot args when options are undefined', () => {
    const factory = new DefaultArtifactTransformerFactory();
    const resolver = factory as unknown as {
      resolveDotArgs: (options?: Record<string, unknown>) => string[];
    };

    expect(resolver.resolveDotArgs()).toEqual([]);
  });
});
