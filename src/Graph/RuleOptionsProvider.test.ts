import { resolveRuleOptions } from './RuleOptionsProvider.js';

describe('resolveRuleOptions', () => {
  it('shoud return plain options unchanged', () => {
    const options = { value: 'static' };

    expect(resolveRuleOptions(options)).toBe(options);
  });

  it('shoud resolve options from a provider', () => {
    const options = { value: 'provided' };

    expect(
      resolveRuleOptions({
        getRuleOptions: () => options,
      }),
    ).toBe(options);
  });
});
