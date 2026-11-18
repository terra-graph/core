import { parse } from 'yaml';
import {
  RuntimeConfigParser,
  normalizeRuntimeConfigParserFormat,
} from '../RuntimeConfigParser.js';

export class YamlRuntimeConfigParser implements RuntimeConfigParser {
  public supports(format: string): boolean {
    const normalized = normalizeRuntimeConfigParserFormat(format);
    return (
      normalized === 'yaml' ||
      normalized === '.yaml' ||
      normalized === '.yml' ||
      normalized === 'application/yaml' ||
      normalized === 'application/x-yaml' ||
      normalized === 'text/yaml'
    );
  }

  public parse(content: string): unknown {
    return parse(content);
  }
}
