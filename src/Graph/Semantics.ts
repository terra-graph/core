import { AdapterOperations } from './Operations/Operations.js';
import {
  EdgeId,
  NodeId,
  TgEdgeAttributes,
  TgSemanticFact,
  edgeIdFrom,
} from './TgGraph.js';

export interface SemanticDecorator {
  readonly name: string;

  extract(args: { graph: AdapterOperations }): AdapterOperations;
  project(args: { graph: AdapterOperations }): AdapterOperations;
}

export type SerializedSemanticDecoratorRef = {
  id: string;
  config?: unknown;
};

type SemanticDecoratorFactory = (config?: unknown) => SemanticDecorator;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isSemanticDecorator = (
  value: unknown,
): value is SemanticDecorator => {
  return (
    isObjectRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.extract === 'function' &&
    typeof value.project === 'function'
  );
};

export type SemanticDecoratorDefinition =
  | SemanticDecorator
  | SerializedSemanticDecoratorRef;

const semanticDecoratorRegistry: Record<string, SemanticDecoratorFactory> = {};

const registerSemanticDecorator = (
  id: string,
  definition: SemanticDecorator | SemanticDecoratorFactory,
): void => {
  semanticDecoratorRegistry[id] =
    typeof definition === 'function' ? definition : () => definition;
};

const resolveSemanticDecorator = (
  definition: SemanticDecoratorDefinition,
): SemanticDecorator => {
  if (isSemanticDecorator(definition)) {
    return definition;
  }

  const factory = semanticDecoratorRegistry[definition.id];
  if (!factory) {
    throw new Error(`SemanticDecorator '${definition.id}' is not registered`);
  }

  return factory(definition.config);
};

export const SemanticDecoratorRegistry = {
  register: registerSemanticDecorator,
  resolve: resolveSemanticDecorator,
} as const;

export const resolveSemanticDecorators = (
  definitions: SemanticDecoratorDefinition[] | undefined,
): SemanticDecorator[] => {
  return (definitions ?? []).map((definition) =>
    resolveSemanticDecorator(definition),
  );
};

const factKey = (fact: TgSemanticFact): string =>
  JSON.stringify({
    kind: fact.kind,
    from: fact.from,
    to: fact.to,
    source: fact.source,
    confidence: fact.confidence,
    decorator: fact.decorator,
    attributes: fact.attributes ?? {},
  });

const mergeFacts = (
  existing: TgSemanticFact[] | undefined,
  next: TgSemanticFact,
): TgSemanticFact[] => {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map(factKey));
  const key = factKey(next);
  if (!seen.has(key)) {
    merged.push(next);
  }
  return merged;
};

export const withEdgeSemanticFact = (
  attributes: TgEdgeAttributes,
  fact: TgSemanticFact,
): TgEdgeAttributes => ({
  ...attributes,
  semantic: {
    ...attributes.semantic,
    facts: mergeFacts(attributes.semantic?.facts, fact),
  },
});

export const withProjectionSemanticFact = (
  attributes: TgEdgeAttributes,
  fact: TgSemanticFact,
): TgEdgeAttributes => ({
  ...attributes,
  projection: {
    ...(attributes.projection ?? { layer: 'core' }),
    semantics: {
      ...attributes.projection?.semantics,
      facts: mergeFacts(attributes.projection?.semantics?.facts, fact),
    },
  },
});

export const addSemanticFactToEdge = (
  graph: AdapterOperations,
  edgeId: EdgeId,
  fact: TgSemanticFact,
): AdapterOperations => {
  const attributes = graph.getEdgeAttributes(edgeId);
  return graph.setEdge(
    edgeId,
    graph.edgeSource(edgeId),
    graph.edgeTarget(edgeId),
    withEdgeSemanticFact(attributes, fact),
  );
};

export const addProjectionSemanticFactToEdge = (
  graph: AdapterOperations,
  edgeId: EdgeId,
  fact: TgSemanticFact,
): AdapterOperations => {
  const attributes = graph.getEdgeAttributes(edgeId);
  return graph.setEdge(
    edgeId,
    graph.edgeSource(edgeId),
    graph.edgeTarget(edgeId),
    withProjectionSemanticFact(attributes, fact),
  );
};

export const addProjectionSemanticFactBetweenNodes = (
  graph: AdapterOperations,
  from: NodeId,
  to: NodeId,
  fact: TgSemanticFact,
  suffix = `projection:semantic:${fact.decorator ?? 'semantic'}:${fact.kind}`,
): AdapterOperations => {
  const edgeId = edgeIdFrom(from, to, suffix);
  const existingAttributes = graph.getEdgeAttributes(edgeId);
  const attributes =
    existingAttributes ??
    ({
      projection: {
        layer: 'core',
      },
    } satisfies TgEdgeAttributes);

  return graph.setEdge(
    edgeId,
    from,
    to,
    withProjectionSemanticFact(attributes, fact),
  );
};

export const findFirstEdgeBetweenEitherDirection = (
  graph: AdapterOperations,
  from: NodeId,
  to: NodeId,
): EdgeId | undefined => {
  return graph.edgesBetween(from, to)[0] ?? graph.edgesBetween(to, from)[0];
};
