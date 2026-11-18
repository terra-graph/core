import { DefaultEdgeSemanticRoles } from '../../TgGraph.js';
import {
  DEFAULT_EDGE_SEMANTIC_VALUES,
  DefaultEdgeSemantics,
  isDefaultEdgeSemantic,
} from './EdgeSemantics.js';

describe('EdgeSemantics', () => {
  it('shoud expose the expected default semantic values', () => {
    expect(DEFAULT_EDGE_SEMANTIC_VALUES).toStrictEqual([
      DefaultEdgeSemantics.Invokes,
      DefaultEdgeSemantics.Accesses,
      DefaultEdgeSemantics.Publishes,
      DefaultEdgeSemantics.Triggers,
      DefaultEdgeSemantics.Routes,
      DefaultEdgeSemantics.Authorizes,
      DefaultEdgeSemantics.ObservedBy,
    ]);
  });

  it('shoud validate known semantic objects', () => {
    expect(isDefaultEdgeSemantic(DefaultEdgeSemantics.Invokes)).toBe(true);
    expect(isDefaultEdgeSemantic(DefaultEdgeSemantics.Authorizes)).toBe(true);
  });

  it('shoud reject unknown or malformed semantic objects', () => {
    expect(isDefaultEdgeSemantic('unknown')).toBe(false);
    expect(
      isDefaultEdgeSemantic({
        semantic: 'invokes',
        role: DefaultEdgeSemanticRoles.Supporting,
      }),
    ).toBe(false);
    expect(isDefaultEdgeSemantic({ semantic: 'invokes' })).toBe(false);
    expect(isDefaultEdgeSemantic(null)).toBe(false);
  });
});
