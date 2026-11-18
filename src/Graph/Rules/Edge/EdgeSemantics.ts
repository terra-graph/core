import {
  DefaultEdgeSemanticRole,
  DefaultEdgeSemanticRoles,
  TgEdgeSemanticHint,
} from '../../TgGraph.js';

const asDefaultEdgeSemantic = (
  semantic: string,
  role: DefaultEdgeSemanticRole,
): TgEdgeSemanticHint => ({
  semantic,
  role,
});

export const DefaultEdgeSemantics = {
  Invokes: asDefaultEdgeSemantic('invokes', DefaultEdgeSemanticRoles.Primary),
  Accesses: asDefaultEdgeSemantic('accesses', DefaultEdgeSemanticRoles.Primary),
  Publishes: asDefaultEdgeSemantic(
    'publishes',
    DefaultEdgeSemanticRoles.Primary,
  ),
  Triggers: asDefaultEdgeSemantic('triggers', DefaultEdgeSemanticRoles.Primary),
  Routes: asDefaultEdgeSemantic('routes', DefaultEdgeSemanticRoles.Primary),
  Authorizes: asDefaultEdgeSemantic(
    'authorizes',
    DefaultEdgeSemanticRoles.Supporting,
  ),
  ObservedBy: asDefaultEdgeSemantic(
    'observedBy',
    DefaultEdgeSemanticRoles.Supporting,
  ),
} as const;

export type DefaultEdgeSemantic =
  (typeof DefaultEdgeSemantics)[keyof typeof DefaultEdgeSemantics];

export const DEFAULT_EDGE_SEMANTIC_VALUES = Object.freeze(
  Object.values(DefaultEdgeSemantics),
) as readonly DefaultEdgeSemantic[];

export const isDefaultEdgeSemantic = (
  value: unknown,
): value is DefaultEdgeSemantic =>
  typeof value === 'object' &&
  value !== null &&
  DEFAULT_EDGE_SEMANTIC_VALUES.some(
    (semantic) =>
      semantic.semantic === (value as Partial<TgEdgeSemanticHint>).semantic &&
      semantic.role === (value as Partial<TgEdgeSemanticHint>).role,
  );
