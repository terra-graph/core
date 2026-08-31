import { mock } from 'jest-mock-extended';
import type { AdapterOperations } from './Operations/Operations.js';
import { resolveRuleOptions } from './RuleOptionsProvider.js';
import { asNodeId } from './TgGraph.js';

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

  it('shoud pass resolution context to an options provider', () => {
    const options = { value: 'provided' };
    const graph = mock<AdapterOperations>();
    const nodeId = asNodeId('node-a');
    const getRuleOptions = jest.fn().mockReturnValue(options);

    expect(
      resolveRuleOptions(
        {
          getRuleOptions,
        },
        { graph, nodeId },
      ),
    ).toBe(options);
    expect(getRuleOptions).toHaveBeenCalledWith({ graph, nodeId });
  });

  it('shoud resolve async options from a provider', async () => {
    const options = { value: 'provided' };

    await expect(
      resolveRuleOptions({
        getRuleOptions: async () => options,
      }),
    ).resolves.toBe(options);
  });
});
