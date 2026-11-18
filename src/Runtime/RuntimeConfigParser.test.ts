import { normalizeRuntimeConfigParserFormat } from './RuntimeConfigParser.js';

describe('RuntimeConfigParser.normalizeRuntimeConfigParserFormat', () => {
  it('shoud normalize parser format values by trimming and lowering case', () => {
    expect(normalizeRuntimeConfigParserFormat('  APPLICATION/JSON  ')).toBe(
      'application/json',
    );
  });
});
