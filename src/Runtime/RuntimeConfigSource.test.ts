import {
  inferRuntimeConfigFormatFromReference,
  normalizeRuntimeConfigFormat,
} from './RuntimeConfigSource.js';

describe('RuntimeConfigSource.normalizeRuntimeConfigFormat', () => {
  it('shoud normalize format strings by trimming and lowering case', () => {
    expect(normalizeRuntimeConfigFormat('  JSON  ')).toBe('json');
  });
});

describe('RuntimeConfigSource.inferRuntimeConfigFormatFromReference', () => {
  it('shoud infer json from file extension', () => {
    expect(inferRuntimeConfigFormatFromReference('/tmp/config.JSON')).toBe(
      'json',
    );
  });

  it('shoud infer yaml from file extensions', () => {
    expect(inferRuntimeConfigFormatFromReference('/tmp/config.yaml')).toBe(
      'yaml',
    );
    expect(inferRuntimeConfigFormatFromReference('/tmp/config.yml')).toBe(
      'yaml',
    );
  });

  it('shoud return undefined for unknown extensions', () => {
    expect(inferRuntimeConfigFormatFromReference('/tmp/config.toml')).toBe(
      undefined,
    );
  });

  it('shoud return undefined for missing references', () => {
    expect(inferRuntimeConfigFormatFromReference(undefined)).toBe(undefined);
  });
});
