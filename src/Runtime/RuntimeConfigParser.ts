import { normalizeRuntimeConfigFormat } from './RuntimeConfigSource.js';

export interface RuntimeConfigParser {
  supports(format: string): boolean;
  parse(content: string): unknown;
}

export const normalizeRuntimeConfigParserFormat = (format: string): string =>
  normalizeRuntimeConfigFormat(format);
