import {
  RuntimeConfigParser,
  normalizeRuntimeConfigParserFormat,
} from './RuntimeConfigParser.js';
import { JsonRuntimeConfigParser } from './RuntimeConfigParser/JsonRuntimeConfigParser.js';
import { YamlRuntimeConfigParser } from './RuntimeConfigParser/YamlRuntimeConfigParser.js';

export class RuntimeConfigParserRegistry {
  private readonly parsers: readonly RuntimeConfigParser[];

  constructor(parsers: RuntimeConfigParser[] = []) {
    this.parsers = Object.freeze([...parsers]);
  }

  public static defaults(): RuntimeConfigParserRegistry {
    return new RuntimeConfigParserRegistry([
      new JsonRuntimeConfigParser(),
      new YamlRuntimeConfigParser(),
    ]);
  }

  public register(parser: RuntimeConfigParser): RuntimeConfigParserRegistry {
    return new RuntimeConfigParserRegistry([...this.parsers, parser]);
  }

  public use(
    registry: RuntimeConfigParserRegistry,
  ): RuntimeConfigParserRegistry {
    return new RuntimeConfigParserRegistry([
      ...this.parsers,
      ...registry.parsers,
    ]);
  }

  public resolve(format: string): RuntimeConfigParser {
    const normalized = normalizeRuntimeConfigParserFormat(format);
    const parser = this.parsers.find((candidate) =>
      candidate.supports(normalized),
    );
    if (!parser) {
      throw new Error(
        `No RuntimeConfigParser registered for format '${format}'`,
      );
    }
    return parser;
  }
}
