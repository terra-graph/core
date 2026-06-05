import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from './Adapters/GraphologyAdapter.js';
import type { AdapterOperations } from './Operations/Operations.js';
import {
  type SemanticDecorator,
  SemanticDecoratorRegistry,
  addProjectionSemanticFactBetweenNodes,
  addProjectionSemanticFactToEdge,
  addSemanticFactBetweenNodes,
  addSemanticFactToEdge,
  buildProjectionOwners,
  findFirstEdgeBetweenEitherDirection,
  getNodeSemanticContext,
  isSemanticDecorator,
  projectSemanticFactsByOwners,
  resolveSemanticDecorators,
  setNodeSemanticContext,
  toProjectedSemanticFact,
  withEdgeSemanticFact,
  withProjectionSemanticFact,
} from './Semantics.js';
import {
  TG_SCHEMA_VERSION,
  type TgEdgeAttributes,
  type TgGraph,
  type TgSemanticFact,
  asEdgeId,
  asNodeId,
} from './TgGraph.js';

describe('Semantics', () => {
  const firstId = asNodeId('first');
  const secondId = asNodeId('second');
  const rootId = asNodeId('raw-root');
  const anchorId = asNodeId('raw-anchor');
  const projectionId = asNodeId('projection');
  const projectionPeerId = asNodeId('projection-peer');
  const projectionUnownedId = asNodeId('projection-unowned');
  const semanticFact: TgSemanticFact = {
    kind: 'feeds',
    from: firstId,
    to: secondId,
    source: 'explicit_connection',
    confidence: 'exact',
    decorator: 'test.decorator',
    attributes: { endpoint: 'source' },
  };

  const createAdapter = (): AdapterOperations => {
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [firstId]: { id: firstId },
        [secondId]: { id: secondId },
        [rootId]: { id: rootId },
        [anchorId]: { id: anchorId },
        [projectionId]: {
          id: projectionId,
          projection: {
            layer: 'core',
            address: 'projection',
            label: 'Projection',
            derivation: {
              source: 'plugin',
              rootNodeId: rootId,
              anchors: [{ nodeId: anchorId }],
            },
          },
        },
        [projectionPeerId]: {
          id: projectionPeerId,
          projection: {
            layer: 'core',
            address: 'projection-peer',
            label: 'Projection Peer',
            derivation: {
              source: 'plugin',
              rootNodeId: secondId,
              anchors: [{ nodeId: secondId }],
              instanceKey: 'abi',
              rootInstanceAddress:
                'module.app["abi"].aws_lambda_function.fn[0]',
            },
          },
        },
        [projectionUnownedId]: {
          id: projectionUnownedId,
          projection: {
            layer: 'core',
            address: 'projection-unowned',
            label: 'Projection Unowned',
            derivation: {
              source: 'plugin',
            },
          },
        },
      },
      edges: [],
    };

    return new GraphologyAdapter(new DirectedGraph()).withTgGraph(graph);
  };

  it('should identify and resolve semantic decorators', () => {
    const decorator: SemanticDecorator = {
      name: 'test.decorator',
      extract: ({ graph }) => graph,
      project: ({ graph }) => graph,
    };
    const registryId = `test.registry.${Date.now()}`;

    expect(isSemanticDecorator(decorator)).toBe(true);
    expect(isSemanticDecorator({ name: 'x', extract: () => undefined })).toBe(
      false,
    );

    SemanticDecoratorRegistry.register(registryId, (config) => ({
      ...decorator,
      name: `${decorator.name}:${String(config)}`,
    }));
    SemanticDecoratorRegistry.register(`${registryId}.singleton`, decorator);

    const [resolvedDirect, resolvedRegistry, resolvedSingleton] =
      resolveSemanticDecorators([
        decorator,
        { id: registryId, config: 'configured' },
        { id: `${registryId}.singleton` },
      ]);

    expect(resolvedDirect).toBe(decorator);
    expect(resolvedRegistry.name).toBe('test.decorator:configured');
    expect(resolvedSingleton).toBe(decorator);
    expect(resolveSemanticDecorators(undefined)).toStrictEqual([]);
    expect(() =>
      resolveSemanticDecorators([{ id: 'missing.decorator' }]),
    ).toThrow("SemanticDecorator 'missing.decorator' is not registered");
  });

  it('should merge semantic facts into edge attributes without duplication', () => {
    const plainAttributes: TgEdgeAttributes = {};
    const withEdge = withEdgeSemanticFact(plainAttributes, semanticFact);
    const mergedEdge = withEdgeSemanticFact(withEdge, semanticFact);
    expect(mergedEdge.semantic?.facts).toHaveLength(1);

    const attributeLessFact = { ...semanticFact, attributes: undefined };
    expect(
      withEdgeSemanticFact(plainAttributes, attributeLessFact).semantic?.facts,
    ).toHaveLength(1);

    const withProjection = withProjectionSemanticFact(
      plainAttributes,
      semanticFact,
    );
    const mergedProjection = withProjectionSemanticFact(
      withProjection,
      semanticFact,
    );
    expect(mergedProjection.projection?.layer).toBe('core');
    expect(mergedProjection.projection?.semantics?.facts).toHaveLength(1);
  });

  it('should add semantic facts to raw and projection edges and find edges in either direction', () => {
    let adapter = createAdapter();
    const rawEdgeId = asEdgeId('raw-edge');
    adapter = adapter.setEdge(rawEdgeId, firstId, secondId, {});

    adapter = addSemanticFactToEdge(adapter, rawEdgeId, semanticFact);
    expect(adapter.getEdgeAttributes(rawEdgeId).semantic?.facts).toHaveLength(
      1,
    );

    const reverseEdgeId = asEdgeId('reverse-edge');
    adapter = adapter.setEdge(reverseEdgeId, secondId, firstId, {});
    expect([rawEdgeId, reverseEdgeId]).toContain(
      findFirstEdgeBetweenEitherDirection(adapter, firstId, secondId),
    );
    expect(
      findFirstEdgeBetweenEitherDirection(adapter, secondId, rootId),
    ).toBeUndefined();

    adapter = addProjectionSemanticFactBetweenNodes(
      adapter,
      projectionId,
      projectionPeerId,
      semanticFact,
      'projection:test',
    );
    const projectionBetweenId = asEdgeId(
      `tg:1.0.0:edge:${projectionId}->${projectionPeerId}:projection:test`,
    );
    expect(
      adapter.getEdgeAttributes(projectionBetweenId).projection?.semantics
        ?.facts,
    ).toHaveLength(1);

    adapter = addProjectionSemanticFactBetweenNodes(
      adapter,
      projectionId,
      projectionPeerId,
      semanticFact,
      'projection:test',
    );

    adapter = addProjectionSemanticFactToEdge(
      adapter,
      projectionBetweenId,
      semanticFact,
    );
    expect(
      adapter.getEdgeAttributes(projectionBetweenId).projection?.semantics
        ?.facts,
    ).toHaveLength(1);

    adapter = addProjectionSemanticFactBetweenNodes(
      adapter,
      projectionPeerId,
      projectionUnownedId,
      {
        ...semanticFact,
        decorator: undefined,
      },
    );
    expect(
      adapter.getEdgeAttributes(
        asEdgeId(
          `tg:1.0.0:edge:${projectionPeerId}->${projectionUnownedId}:projection:semantic:semantic:feeds`,
        ),
      ).projection?.semantics?.facts,
    ).toHaveLength(1);

    adapter = addProjectionSemanticFactBetweenNodes(
      adapter,
      projectionPeerId,
      projectionId,
      semanticFact,
      'projection:test-reverse',
    );
    const reverseProjectionEdgeId = asEdgeId(
      `tg:1.0.0:edge:${projectionPeerId}->${projectionId}:projection:test-reverse`,
    );
    adapter = addProjectionSemanticFactToEdge(
      adapter,
      reverseProjectionEdgeId,
      semanticFact,
    );
    expect(
      adapter.getEdgeAttributes(reverseProjectionEdgeId).projection?.semantics
        ?.facts,
    ).toHaveLength(1);
  });

  it('should add semantic facts between nodes and preserve node semantic context', () => {
    let adapter = createAdapter();
    const suffix = 'semantic:test';
    adapter = addSemanticFactBetweenNodes(
      adapter,
      firstId,
      secondId,
      semanticFact,
      suffix,
    );
    const createdEdgeId = asEdgeId(
      `tg:1.0.0:edge:${firstId}->${secondId}:${suffix}`,
    );
    expect(
      adapter.getEdgeAttributes(createdEdgeId).semantic?.facts,
    ).toHaveLength(1);

    adapter = addSemanticFactBetweenNodes(
      adapter,
      secondId,
      rootId,
      semanticFact,
    );
    expect(
      adapter.getEdgeAttributes(
        asEdgeId(
          `tg:1.0.0:edge:${secondId}->${rootId}:semantic:test.decorator:feeds`,
        ),
      ).semantic?.facts,
    ).toHaveLength(1);

    adapter = addSemanticFactBetweenNodes(adapter, rootId, firstId, {
      ...semanticFact,
      decorator: undefined,
      from: rootId,
      to: firstId,
    });
    expect(
      adapter.getEdgeAttributes(
        asEdgeId(`tg:1.0.0:edge:${rootId}->${firstId}:semantic:semantic:feeds`),
      ).semantic?.facts,
    ).toHaveLength(1);

    adapter = addSemanticFactBetweenNodes(
      adapter,
      firstId,
      secondId,
      semanticFact,
      suffix,
    );
    expect(
      adapter.getEdgeAttributes(createdEdgeId).semantic?.facts,
    ).toHaveLength(1);

    adapter = setNodeSemanticContext(adapter, firstId, 'decorator', {
      clue: 'value',
    });
    expect(
      getNodeSemanticContext<{ clue: string }>(
        adapter.getNodeAttributes(firstId),
        'decorator',
      ),
    ).toStrictEqual({ clue: 'value' });
    expect(
      getNodeSemanticContext(adapter.getNodeAttributes(secondId), 'missing'),
    ).toBeUndefined();

    adapter = setNodeSemanticContext(
      adapter,
      asNodeId('missing'),
      'decorator',
      {
        clue: 'ignored',
      },
    );
    expect(adapter.getNodeAttributes(asNodeId('missing'))).toBeUndefined();

    expect(
      getNodeSemanticContext(
        {
          semantic: {
            contexts: {
              broken: 'not-an-object' as never,
            },
          },
        },
        'broken',
      ),
    ).toBeUndefined();
  });

  it('should build projection owners, project semantic facts, and preserve raw endpoints', () => {
    let adapter = createAdapter();
    const owners = buildProjectionOwners(adapter);
    expect(owners.get(rootId)).toStrictEqual([projectionId]);
    expect(owners.get(anchorId)).toStrictEqual([projectionId]);
    expect(owners.get(asNodeId('missing-owner'))).toBeUndefined();

    const projected = toProjectedSemanticFact(
      semanticFact,
      projectionId,
      projectionPeerId,
    );
    expect(projected.from).toBe(projectionId);
    expect(projected.to).toBe(projectionPeerId);
    expect(projected.attributes?.rawFrom).toBe(firstId);
    expect(projected.attributes?.rawTo).toBe(secondId);
    expect(
      toProjectedSemanticFact(
        { ...semanticFact, attributes: undefined },
        projectionId,
        projectionPeerId,
      ).attributes,
    ).toStrictEqual({
      rawFrom: firstId,
      rawTo: secondId,
    });

    adapter = addSemanticFactBetweenNodes(
      adapter,
      rootId,
      secondId,
      {
        ...semanticFact,
        from: rootId,
        to: secondId,
      },
      'semantic:projectable',
    );
    adapter = addSemanticFactBetweenNodes(
      adapter,
      firstId,
      secondId,
      {
        ...semanticFact,
        decorator: 'other.decorator',
      },
      'semantic:other',
    );
    adapter = addSemanticFactBetweenNodes(
      adapter,
      firstId,
      secondId,
      {
        ...semanticFact,
        from: firstId,
        to: secondId,
      },
      'semantic:no-owner',
    );
    adapter = addSemanticFactBetweenNodes(
      adapter,
      rootId,
      firstId,
      {
        ...semanticFact,
        from: rootId,
        to: firstId,
      },
      'semantic:no-target-owner',
    );
    adapter = addSemanticFactBetweenNodes(
      adapter,
      rootId,
      secondId,
      {
        ...semanticFact,
        from: rootId,
        to: secondId,
      },
      'semantic:duplicate-owner',
    );
    adapter = adapter.setEdge(
      asEdgeId(`existing:${projectionId}->${projectionPeerId}`),
      projectionId,
      projectionPeerId,
      {
        projection: {
          layer: 'core',
        },
      },
    );

    const existingProjectionEdgeId = asEdgeId(
      `existing:${projectionId}->${projectionPeerId}`,
    );
    const projectedAdapter = projectSemanticFactsByOwners(
      adapter,
      'test.decorator',
      owners,
    );

    expect(
      projectedAdapter.getEdgeAttributes(existingProjectionEdgeId).projection
        ?.semantics?.facts,
    ).toHaveLength(1);
    expect(
      projectedAdapter.getEdgeAttributes(existingProjectionEdgeId).projection
        ?.semantics?.facts?.[0]?.attributes?.rawFrom,
    ).toBe(rootId);
    expect(
      projectedAdapter.getEdgeAttributes(existingProjectionEdgeId).projection
        ?.semantics?.facts,
    ).toHaveLength(1);

    let adapterWithoutProjectionEdge = createAdapter();
    adapterWithoutProjectionEdge = addSemanticFactBetweenNodes(
      adapterWithoutProjectionEdge,
      rootId,
      secondId,
      {
        ...semanticFact,
        from: rootId,
        to: secondId,
      },
      'semantic:projectable-new',
    );

    const projectedWithoutExistingEdge = projectSemanticFactsByOwners(
      adapterWithoutProjectionEdge,
      'test.decorator',
    );
    const createdProjectionEdgeId = asEdgeId(
      `tg:1.0.0:edge:${projectionId}->${projectionPeerId}:projection:semantic:test.decorator:feeds`,
    );
    expect(
      projectedWithoutExistingEdge.getEdgeAttributes(createdProjectionEdgeId)
        .projection?.semantics?.facts,
    ).toHaveLength(1);
  });
});
