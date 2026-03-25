import { RuntimeConfigParser } from './RuntimeConfigParser.js';
import { RuntimeConfigParserRegistry } from './RuntimeConfigParserRegistry.js';

class FakeYamlParser implements RuntimeConfigParser {
  public supports(format: string): boolean {
    return format === 'yaml';
  }

  public parse(content: string): unknown {
    return { content };
  }
}

describe('RuntimeConfigParserRegistry.defaults', () => {
  it('shoud include json and yaml parsers by default', () => {
    const registry = RuntimeConfigParserRegistry.defaults();

    expect(registry.resolve('json').parse('{"ok":true}')).toEqual({ ok: true });
    expect(registry.resolve('yaml').parse('value: ok')).toEqual({
      value: 'ok',
    });
  });
});

describe('RuntimeConfigParserRegistry.register', () => {
  it('shoud return a new registry without mutating the original', () => {
    const base = RuntimeConfigParserRegistry.defaults();
    const next = base.register(new FakeYamlParser());

    expect(base.resolve('yaml').parse('value: ok')).toEqual({ value: 'ok' });
    expect(next.resolve('yaml').parse('value: ok')).toEqual({ value: 'ok' });
  });

  it('shoud allow registering parsers on an empty registry', () => {
    const base = new RuntimeConfigParserRegistry();
    const next = base.register(new FakeYamlParser());

    expect(() => base.resolve('yaml')).toThrow(
      "No RuntimeConfigParser registered for format 'yaml'",
    );
    expect(next.resolve('yaml').parse('value: ok')).toEqual({
      content: 'value: ok',
    });
  });
});

describe('RuntimeConfigParserRegistry.use', () => {
  it('shoud combine parser registries immutably', () => {
    const one = RuntimeConfigParserRegistry.defaults();
    const two = new RuntimeConfigParserRegistry([new FakeYamlParser()]);

    const combined = one.use(two);

    expect(one.resolve('yaml').parse('value: ok')).toEqual({ value: 'ok' });
    expect(combined.resolve('yaml').parse('value: ok')).toEqual({
      value: 'ok',
    });
  });
});

describe('RuntimeConfigParserRegistry.resolve', () => {
  it('shoud throw when parser format is not registered', () => {
    const registry = RuntimeConfigParserRegistry.defaults();

    expect(() => registry.resolve('toml')).toThrow(
      "No RuntimeConfigParser registered for format 'toml'",
    );
  });
});
