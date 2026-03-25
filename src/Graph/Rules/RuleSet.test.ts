import { Profile } from '../Profile.js';
import { NamedRuleRegistry } from './NamedRuleRegistry.js';
import { NamedRuleSetRegistry } from './NamedRuleSetRegistry.js';
import { BaseRule } from './Rule.js';
import { RuleSet } from './RuleSet.js';
import './Node/RemoveNode.js';

describe('RuleSet.resolvePhases', () => {
  it('shoud resolve named rules when a registry is provided', () => {
    const registry = new NamedRuleRegistry({
      removeDataNodes: {
        id: 'RemoveNode',
        config: {
          node: {
            attr: {
              key: 'label',
              startsWith: 'data.',
            },
          },
        },
      },
    });
    const ruleSet = new RuleSet({
      rules: [{ namedRule: 'removeDataNodes' }],
    });

    const phases = ruleSet.resolvePhases(registry);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: {
        node: {
          attr: {
            key: 'label',
            startsWith: 'data.',
          },
        },
      },
    });
  });

  it('shoud throw when named rules are used without a registry', () => {
    const ruleSet = new RuleSet({
      rules: [{ namedRule: 'removeDataNodes' }],
    });

    expect(() => ruleSet.resolvePhases()).toThrow(
      'RuleSet contains named rules but no NamedRuleRegistry was provided',
    );
  });

  it('shoud resolve named rule sets when a registry is provided', () => {
    const namedRules = new NamedRuleRegistry({
      removeDataNodes: {
        id: 'RemoveNode',
        config: {
          node: {
            attr: {
              key: 'label',
              startsWith: 'data.',
            },
          },
        },
      },
    });
    const namedRuleSets = new NamedRuleSetRegistry({
      baseSet: new RuleSet({
        rules: [{ namedRule: 'removeDataNodes' }],
      }),
    });
    const ruleSet = new RuleSet({
      rules: [{ namedRuleSet: 'baseSet' }],
    });

    const phases = ruleSet.resolvePhases(namedRules, namedRuleSets);

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual({
      id: 'RemoveNode',
      config: {
        node: {
          attr: {
            key: 'label',
            startsWith: 'data.',
          },
        },
      },
    });
  });

  it('shoud throw when named rule sets are used without a registry', () => {
    const ruleSet = new RuleSet({
      rules: [{ namedRuleSet: 'baseSet' }],
    });

    expect(() => ruleSet.resolvePhases()).toThrow(
      'RuleSet contains named rule sets but no NamedRuleSetRegistry was provided',
    );
  });

  it('shoud handle named rule sets that resolve to no phases', () => {
    const namedRuleSets = new NamedRuleSetRegistry({
      empty: () => ({ resolvePhases: () => [] }) as unknown as RuleSet,
    });
    const ruleSet = new RuleSet({
      rules: [{ namedRuleSet: 'empty' }],
    });

    const phases = ruleSet.resolvePhases(undefined, namedRuleSets);

    expect(phases).toEqual([[]]);
  });

  it('shoud resolve named rule sets via the internal resolver path', () => {
    const namedRuleSets = new NamedRuleSetRegistry({
      empty: new RuleSet(),
    });
    const ruleSet = new RuleSet();
    const resolveRule = ruleSet as unknown as {
      resolveRule: (
        rule: { namedRuleSet: string },
        namedRules: undefined,
        namedRuleSets: NamedRuleSetRegistry,
      ) => unknown[];
    };

    const resolved = resolveRule.resolveRule(
      { namedRuleSet: 'empty' },
      undefined,
      namedRuleSets,
    );

    expect(resolved).toEqual([]);
  });

  it('shoud resolve concrete rules by serializing and rehydrating', () => {
    const rule = BaseRule.fromSerialized({
      id: 'RemoveNode',
      config: {
        node: {
          attr: {
            key: 'label',
            startsWith: 'data.',
          },
        },
      },
    });
    const ruleSet = new RuleSet({
      rules: [rule],
    });

    const phases = ruleSet.resolvePhases();

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual(rule.serialize());
  });

  it('shoud resolve serialized rules without registries', () => {
    const serializedRule = {
      id: 'RemoveNode',
      config: {
        node: {
          attr: {
            key: 'label',
            startsWith: 'data.',
          },
        },
      },
    };
    const ruleSet = new RuleSet({
      rules: [serializedRule],
    });

    const phases = ruleSet.resolvePhases();

    expect(phases).toHaveLength(1);
    expect(phases[0]).toHaveLength(1);
    expect(phases[0][0].serialize()).toEqual(serializedRule);
  });
});

describe('RuleSet.serialize', () => {
  it('shoud serialize and deserialize phases', () => {
    const ruleSet = new RuleSet({
      rules: [{ namedRule: 'removeDataNodes' }],
    });

    const serialized = ruleSet.serialize();
    const restored = RuleSet.deseriaize(serialized);

    expect(restored.serialize()).toStrictEqual(serialized);
  });

  it('shoud serialize concrete rules with their serialized form', () => {
    const rule = BaseRule.fromSerialized({
      id: 'RemoveNode',
      config: {
        node: {
          attr: {
            key: 'label',
            startsWith: 'data.',
          },
        },
      },
    });
    const ruleSet = new RuleSet({
      rules: [rule],
    });

    expect(ruleSet.serialize()).toEqual({
      rules: [rule.serialize()],
    });
  });
});

describe('RuleSet.deseriaize', () => {
  it('shoud default to empty rules when none are provided', () => {
    const restored = RuleSet.deseriaize({});

    expect(restored.toPhases()).toEqual([{ phase: 'main', rules: [] }]);
  });
});

describe('RuleSet.toPhases', () => {
  it('shoud provide phases that can be consumed by a profile', () => {
    const ruleSet = new RuleSet({
      rules: [{ namedRule: 'removeDataNodes' }],
    });
    const profile = new Profile('overview', { phases: ruleSet.toPhases() });

    const phases = profile.serialize().phases ?? [];
    expect(phases).toHaveLength(1);
    expect(phases[0]).toEqual({
      phase: 'main',
      rules: [{ namedRule: 'removeDataNodes' }],
    });
  });
});

describe('RuleSet.constructor', () => {
  it('shoud default to empty rules when options are omitted', () => {
    const ruleSet = new RuleSet();

    expect(ruleSet.toPhases()).toEqual([{ phase: 'main', rules: [] }]);
  });
});

describe('RuleSet.addRules', () => {
  it('shoud return a new ruleset with appended rules', () => {
    const ruleSet = new RuleSet({
      rules: [{ namedRule: 'firstRule' }],
    });

    const next = ruleSet.addRules([{ namedRule: 'secondRule' }]);

    expect(next).not.toBe(ruleSet);
    expect(ruleSet.toPhases()[0]).toEqual({
      phase: 'main',
      rules: [{ namedRule: 'firstRule' }],
    });
    expect(next.toPhases()[0]).toEqual({
      phase: 'main',
      rules: [{ namedRule: 'firstRule' }, { namedRule: 'secondRule' }],
    });
  });
});
