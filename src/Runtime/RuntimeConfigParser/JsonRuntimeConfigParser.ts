import {
  RuntimeConfigParser,
  normalizeRuntimeConfigParserFormat,
} from '../RuntimeConfigParser.js';

export class JsonRuntimeConfigParser implements RuntimeConfigParser {
  public supports(format: string): boolean {
    const normalized = normalizeRuntimeConfigParserFormat(format);
    return (
      normalized === 'json' ||
      normalized === '.json' ||
      normalized === 'application/json'
    );
  }

  public parse(content: string): unknown {
    return JSON.parse(content);
  }
}
