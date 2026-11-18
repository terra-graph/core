import { JsonRuntimeConfigParser } from './JsonRuntimeConfigParser.js';

describe('JsonRuntimeConfigParser.supports', () => {
  it('shoud support json aliases', () => {
    const parser = new JsonRuntimeConfigParser();

    expect(parser.supports('json')).toBe(true);
    expect(parser.supports('.json')).toBe(true);
    expect(parser.supports('application/json')).toBe(true);
    expect(parser.supports('yaml')).toBe(false);
  });
});

describe('JsonRuntimeConfigParser.parse', () => {
  it('shoud parse json content into an object', () => {
    const parser = new JsonRuntimeConfigParser();

    expect(parser.parse('{"value":1}')).toEqual({ value: 1 });
  });

  it('shoud throw when json is invalid', () => {
    const parser = new JsonRuntimeConfigParser();

    expect(() => parser.parse('{invalid-json')).toThrow();
  });
});
