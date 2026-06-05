import { isObjectRecord } from '../ObjectUtilities.js';
import { AdapterOperations } from './Operations/Operations.js';
import {
  EdgeId,
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  TgNodeSemanticContext,
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
  const existingAttributes = graph
    .edgesBetween(from, to)
    .find((candidateEdgeId) => String(candidateEdgeId) === String(edgeId))
    ? graph.getEdgeAttributes(edgeId)
    : undefined;
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

export const addSemanticFactBetweenNodes = (
  graph: AdapterOperations,
  from: NodeId,
  to: NodeId,
  fact: TgSemanticFact,
  suffix = `semantic:${fact.decorator ?? 'semantic'}:${fact.kind}`,
): AdapterOperations => {
  const existingEdgeId = findFirstEdgeBetweenEitherDirection(graph, from, to);
  const edgeId = existingEdgeId ?? edgeIdFrom(from, to, suffix);
  if (existingEdgeId) {
    return addSemanticFactToEdge(graph, edgeId, fact);
  }

  return graph.setEdge(edgeId, from, to, {
    semantic: {
      facts: [fact],
    },
  });
};

export const getNodeSemanticContext = <T extends TgNodeSemanticContext>(
  node: TgNodeAttributes | undefined,
  decorator: string,
): T | undefined => {
  const context = node?.semantic?.contexts?.[decorator];
  return isObjectRecord(context) ? (context as T) : undefined;
};

export const setNodeSemanticContext = (
  graph: AdapterOperations,
  nodeId: NodeId,
  decorator: string,
  context: TgNodeSemanticContext,
): AdapterOperations => {
  const node = graph.getNodeAttributes(nodeId);
  if (!node) {
    return graph;
  }

  return graph.setNodeAttributes(nodeId, {
    ...node,
    semantic: {
      ...node.semantic,
      contexts: {
        ...(node.semantic?.contexts ?? {}),
        [decorator]: context,
      },
    },
  });
};

export const buildProjectionOwners = (
  graph: AdapterOperations,
): Map<NodeId, NodeId[]> => {
  const owners = new Map<NodeId, NodeId[]>();

  for (const nodeId of graph.nodeIds()) {
    const node = graph.getNodeAttributes(nodeId);
    const derivation = node?.projection?.derivation;
    if (!derivation) {
      continue;
    }

    const ownerIds = new Set<NodeId>();
    if (derivation.rootNodeId) {
      ownerIds.add(derivation.rootNodeId);
    }
    for (const anchor of derivation.anchors ?? []) {
      ownerIds.add(anchor.nodeId);
    }

    for (const ownerId of ownerIds) {
      const current = owners.get(ownerId) ?? [];
      owners.set(ownerId, [...current, nodeId]);
    }
  }

  return owners;
};

export const toProjectedSemanticFact = (
  fact: TgSemanticFact,
  fromProjectionId: NodeId,
  toProjectionId: NodeId,
): TgSemanticFact => ({
  ...fact,
  from: fromProjectionId,
  to: toProjectionId,
  attributes: {
    ...(fact.attributes ?? {}),
    rawFrom: fact.from,
    rawTo: fact.to,
  },
});

export const projectSemanticFactsByOwners = (
  graph: AdapterOperations,
  decorator: string,
  projectionOwners = buildProjectionOwners(graph),
): AdapterOperations => {
  let current = graph;
  const visited = new Set<string>();

  for (const nodeId of graph.nodeIds()) {
    for (const edgeId of graph.outEdges(nodeId)) {
      /* istanbul ignore next -- defensive guard for adapters that may report the same edge multiple times */
      if (visited.has(String(edgeId))) {
        continue;
      }
      visited.add(String(edgeId));

      const edge = current.getEdgeAttributes(edgeId);
      const facts =
        edge.semantic?.facts?.filter((fact) => fact.decorator === decorator) ??
        [];
      if (facts.length === 0) {
        continue;
      }

      for (const fact of facts) {
        const fromProjectionIds = projectionOwners.get(fact.from) ?? [];
        const toProjectionIds = projectionOwners.get(fact.to) ?? [];

        for (const fromProjectionId of fromProjectionIds) {
          for (const toProjectionId of toProjectionIds) {
            const projectionFact = toProjectedSemanticFact(
              fact,
              fromProjectionId,
              toProjectionId,
            );

            const projectionEdgeIds = [
              ...current.edgesBetween(fromProjectionId, toProjectionId),
              ...current.edgesBetween(toProjectionId, fromProjectionId),
            ];

            if (projectionEdgeIds.length === 0) {
              current = addProjectionSemanticFactBetweenNodes(
                current,
                fromProjectionId,
                toProjectionId,
                projectionFact,
              );
              continue;
            }

            for (const projectionEdgeId of projectionEdgeIds) {
              current = addProjectionSemanticFactToEdge(
                current,
                projectionEdgeId,
                projectionFact,
              );
            }
          }
        }
      }
    }
  }

  return current;
};

export const findFirstEdgeBetweenEitherDirection = (
  graph: AdapterOperations,
  from: NodeId,
  to: NodeId,
): EdgeId | undefined => {
  return graph.edgesBetween(from, to)[0] ?? graph.edgesBetween(to, from)[0];
};
