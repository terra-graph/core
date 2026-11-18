import { OclifTransformerFlagParser } from './OclifTransformerFlagParser.js';

describe('OclifTransformerFlagParser.parse', () => {
  it('shoud parse transformer option flags using equals syntax', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse([
      '--transformer=dotcli',
      '--transformer-dotcli-format=png',
      '--transformer-dotcli-dotArg=-Gdpi=200',
    ]);

    expect(options).toEqual({
      dotcli: {
        format: 'png',
        dotArg: '-Gdpi=200',
      },
    });
  });

  it('shoud parse transformer option flags using spaced values', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse([
      '--transformer',
      'dotcli',
      '--transformer-dotcli-format',
      'svg',
      '--transformer-dotcli-verbose',
    ]);

    expect(options).toEqual({
      dotcli: {
        format: 'svg',
        verbose: 'true',
      },
    });
  });

  it('shoud accumulate repeated option values', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse([
      '--transformer-dotcli-dotArg=-Nshape=box',
      '--transformer-dotcli-dotArg=-Ecolor=red',
    ]);

    expect(options).toEqual({
      dotcli: {
        dotArg: ['-Nshape=box', '-Ecolor=red'],
      },
    });
  });

  it('shoud treat missing values as true when followed by another flag', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse(['--transformer-dotcli-format', '--verbose']);

    expect(options).toEqual({
      dotcli: {
        format: 'true',
      },
    });
  });

  it('shoud skip non-transformer tokens and plain transformer flags', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse([
      '--profile=edf.aws.dot',
      '--transformer',
      'dotcli',
      '--transformer-dotcli-format=png',
    ]);

    expect(options).toEqual({
      dotcli: {
        format: 'png',
      },
    });
  });

  it('shoud ignore transformer base flags even when prefix checks pass', () => {
    const parser = new OclifTransformerFlagParser();
    const trickyToken = {
      startsWith: (value: string) =>
        value === '--transformer-' || value === '--transformer=',
    } as unknown as string;

    const options = parser.parse([
      trickyToken,
      '--transformer-dotcli-format=png',
    ]);

    expect(options).toEqual({
      dotcli: {
        format: 'png',
      },
    });
  });

  it('shoud ignore invalid transformer option flags', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse(['--transformer-dotcli']);

    expect(options).toEqual({});
  });

  it('shoud append repeated option values once already an array', () => {
    const parser = new OclifTransformerFlagParser();

    const options = parser.parse([
      '--transformer-dotcli-dotArg=-a',
      '--transformer-dotcli-dotArg=-b',
      '--transformer-dotcli-dotArg=-c',
    ]);

    expect(options).toEqual({
      dotcli: {
        dotArg: ['-a', '-b', '-c'],
      },
    });
  });

  it('shoud validate transformer option flags directly', () => {
    const parser = new OclifTransformerFlagParser();
    const checker = parser as unknown as {
      isTransformerOptionFlag: (token: string) => boolean;
    };

    expect(
      checker.isTransformerOptionFlag('--transformer-dotcli-format=png'),
    ).toBe(true);
    expect(checker.isTransformerOptionFlag('--transformer-dotcli-format')).toBe(
      true,
    );
    expect(checker.isTransformerOptionFlag('--profile=edf.aws.dot')).toBe(
      false,
    );
    const trickyToken = {
      startsWith: (value: string) =>
        value === '--transformer-' || value === '--transformer=',
    } as unknown as string;
    expect(checker.isTransformerOptionFlag(trickyToken)).toBe(false);
    expect(checker.isTransformerOptionFlag('--transformer')).toBe(false);
    expect(checker.isTransformerOptionFlag('--transformer=dotcli')).toBe(false);
  });
});

describe('OclifTransformerFlagParser.stripOptionFlags', () => {
  it('shoud remove transformer option flags while keeping declared flags', () => {
    const parser = new OclifTransformerFlagParser();

    const stripped = parser.stripOptionFlags([
      '--profile=edf.aws.dot',
      '--transformer=dotcli',
      '--transformer-dotcli-format=png',
      '--transformer-dotcli-dotArg',
      '-Gdpi=200',
      '--verbose',
    ]);

    expect(stripped).toEqual([
      '--profile=edf.aws.dot',
      '--transformer=dotcli',
      '--verbose',
    ]);
  });

  it('shoud keep non-matching flags that share the prefix', () => {
    const parser = new OclifTransformerFlagParser();

    const stripped = parser.stripOptionFlags([
      '--transformer-dotcli',
      '--transformer-dotcli-format=png',
      '--transformer',
      'dotcli',
    ]);

    expect(stripped).toEqual([
      '--transformer-dotcli',
      '--transformer',
      'dotcli',
    ]);
  });

  it('shoud not consume the next flag when a value is missing', () => {
    const parser = new OclifTransformerFlagParser();

    const stripped = parser.stripOptionFlags([
      '--transformer-dotcli-format',
      '--verbose',
    ]);

    expect(stripped).toEqual(['--verbose']);
  });
});
