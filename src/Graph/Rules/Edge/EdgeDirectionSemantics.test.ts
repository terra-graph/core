import {
  DEFAULT_EDGE_DIRECTION_SEMANTIC_VALUES,
  DefaultEdgeDirectionSemantics,
  isDefaultEdgeDirectionSemantic,
} from './EdgeDirectionSemantics.js';

describe('EdgeDirectionSemantics', () => {
  it('shoud expose the expected default direction semantic values', () => {
    expect(DEFAULT_EDGE_DIRECTION_SEMANTIC_VALUES).toStrictEqual([
      'invokes',
      'accesses',
      'publishes',
      'triggers',
      'routes',
      'authorizes',
      'observedBy',
    ]);
  });

  it('shoud validate default semantic values', () => {
    expect(
      isDefaultEdgeDirectionSemantic(DefaultEdgeDirectionSemantics.Invokes),
    ).toBe(true);
    expect(isDefaultEdgeDirectionSemantic('unknown')).toBe(false);
  });
});
