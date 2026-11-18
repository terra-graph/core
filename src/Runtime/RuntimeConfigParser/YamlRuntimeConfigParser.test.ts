import { YamlRuntimeConfigParser } from './YamlRuntimeConfigParser.js';

describe('YamlRuntimeConfigParser.supports', () => {
  it('shoud support yaml aliases and mime types', () => {
    const parser = new YamlRuntimeConfigParser();

    expect(parser.supports('yaml')).toBe(true);
    expect(parser.supports('.yaml')).toBe(true);
    expect(parser.supports('.yml')).toBe(true);
    expect(parser.supports('application/yaml')).toBe(true);
    expect(parser.supports('application/x-yaml')).toBe(true);
    expect(parser.supports('text/yaml')).toBe(true);
    expect(parser.supports('json')).toBe(false);
  });
});

describe('YamlRuntimeConfigParser.parse', () => {
  it('shoud parse yaml documents into objects', () => {
    const parser = new YamlRuntimeConfigParser();

    expect(parser.parse('profiles:\n  test:\n    phases: []')).toEqual({
      profiles: {
        test: {
          phases: [],
        },
      },
    });
  });

  it('shoud throw when yaml is invalid', () => {
    const parser = new YamlRuntimeConfigParser();

    expect(() => parser.parse('profiles: [')).toThrow();
  });
});
