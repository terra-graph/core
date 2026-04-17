export const DefaultEdgeDirectionSemantics = {
  Invokes: 'invokes',
  Accesses: 'accesses',
  Publishes: 'publishes',
  Triggers: 'triggers',
  Routes: 'routes',
  Authorizes: 'authorizes',
  ObservedBy: 'observedBy',
} as const;

export type DefaultEdgeDirectionSemantic =
  (typeof DefaultEdgeDirectionSemantics)[keyof typeof DefaultEdgeDirectionSemantics];

export const DEFAULT_EDGE_DIRECTION_SEMANTIC_VALUES = Object.freeze(
  Object.values(DefaultEdgeDirectionSemantics),
) as readonly DefaultEdgeDirectionSemantic[];

export const isDefaultEdgeDirectionSemantic = (
  value: unknown,
): value is DefaultEdgeDirectionSemantic =>
  typeof value === 'string' &&
  DEFAULT_EDGE_DIRECTION_SEMANTIC_VALUES.includes(
    value as DefaultEdgeDirectionSemantic,
  );
