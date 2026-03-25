import { RuleMatchError, RuleModifyError } from './RuleError.js';

describe('RuleMatchError', () => {
  it('shoud include match failure context in the message', () => {
    const cause = new Error('original');
    const error = new RuleMatchError(
      { cause },
      {
        nodeId: 'node-a',
        nodeAttributes: { label: 'node-a' },
      },
    );

    expect(error.message).toBe('Rule was unable to match node node-a');
    expect(error.cause).toBe(cause);
  });
});

describe('RuleModifyError', () => {
  it('shoud include modify failure context in the message', () => {
    const cause = new Error('original');
    const error = new RuleModifyError(
      { cause },
      {
        nodeId: 'node-b',
        nodeAttributes: { label: 'node-b' },
      },
    );

    expect(error.message).toBe('Rule was unable to modify node node-b');
    expect(error.cause).toBe(cause);
  });
});
