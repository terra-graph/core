import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { ProjectionAdjacencyRelationship } from './ProjectionRelationshipSemantic.js';

describe('ProjectionAdjacencyRelationship.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new ProjectionAdjacencyRelationship({
          edge: { from: { any: true }, to: { any: true } },
        }),
    ).toThrow(
      `Rule 'ProjectionAdjacencyRelationship' requires options in config`,
    );
  });

  it('shoud require options.relation', () => {
    expect(
      () =>
        new ProjectionAdjacencyRelationship({
          edge: { from: { any: true }, to: { any: true } },
          options: {},
        }),
    ).toThrow(
      `Rule 'ProjectionAdjacencyRelationship' requires options.relation`,
    );
  });

  it('should validate overwrite and enforceDirection option types', () => {
    expect(
      () =>
        new ProjectionAdjacencyRelationship({
          edge: { from: { any: true }, to: { any: true } },
          options: { relation: 'routes', overwrite: 'yes' as never },
        }),
    ).toThrow(
      `Rule 'ProjectionAdjacencyRelationship' options.overwrite must be a boolean when provided`,
    );

    expect(
      () =>
        new ProjectionAdjacencyRelationship({
          edge: { from: { any: true }, to: { any: true } },
          options: { relation: 'routes', enforceDirection: 'yes' as never },
        }),
    ).toThrow(
      `Rule 'ProjectionAdjacencyRelationship' options.enforceDirection must be a boolean when provided`,
    );
  });
});

describe('ProjectionAdjacencyRelationship.apply', () => {
  const albId = asNodeId('projection-alb');
  const ecsId = asNodeId('projection-ecs');

  const buildAdapter = (graph: TgGraph) =>
    new GraphologyAdapter(new DirectedGraph()).withTgGraph(graph);

  it('shoud reinterpret and reverse matching projection adjacency edges', () => {
    const edgeId = asEdgeId('ecs-depends-on-alb');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: ecsId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
      ],
    });
    const albNode = adapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const rule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: {
            key: 'projection.derivation.projectionName',
            eq: 'aws.alb',
          },
        },
        to: {
          attr: {
            key: 'projection.derivation.projectionName',
            eq: 'aws.ecs',
          },
        },
      },
      options: {
        relation: 'routes',
      },
    });

    rule.match(albId, albNode, adapter);
    const result = rule.apply(albId, albNode, adapter);

    expect(result.edgeSource(edgeId)).toBe(albId);
    expect(result.edgeTarget(edgeId)).toBe(ecsId);
    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship?.relation,
    ).toBe('routes');
    expect(rule.serialize()).toEqual({
      id: 'ProjectionAdjacencyRelationship',
      config: {
        edge: {
          from: {
            attr: {
              key: 'projection.derivation.projectionName',
              eq: 'aws.alb',
            },
          },
          to: {
            attr: {
              key: 'projection.derivation.projectionName',
              eq: 'aws.ecs',
            },
          },
        },
        options: {
          relation: 'routes',
          overwrite: true,
          enforceDirection: true,
        },
      },
    });
  });

  it('should cover non-matching and skip branches during application', () => {
    const edgeId = asEdgeId('out-edge');
    const inEdgeId = asEdgeId('in-edge');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
        [asNodeId('other')]: {
          id: asNodeId('other'),
          projection: {
            layer: 'core',
            address: 'other:node',
            label: 'Other',
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: albId,
          to: ecsId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
              relationship: {
                relation: 'existing',
                source: 'derived',
              },
            },
          },
        },
        {
          id: inEdgeId,
          from: ecsId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
              relationship: {
                relation: 'different',
                source: 'derived',
              },
            },
          },
        },
      ],
    });
    const albNode = adapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const unmatched = new ProjectionAdjacencyRelationship({
      edge: { from: { nodeId: { eq: 'missing' } }, to: { any: true } },
      options: { relation: 'routes' },
    });
    unmatched.match(albId, albNode, adapter);
    expect(unmatched.apply(albId, albNode, adapter)).toBe(adapter);

    const noOverwrite = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: { relation: 'routes', overwrite: false, enforceDirection: true },
    });
    noOverwrite.match(albId, albNode, adapter);
    const result = noOverwrite.apply(albId, albNode, adapter);
    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship?.relation,
    ).toBe('existing');
    expect(result.edgeSource(inEdgeId)).toBe(ecsId);
    expect(result.edgeTarget(inEdgeId)).toBe(albId);
  });

  it('should skip edges whose targets do not match or that are not projection semantics candidates', () => {
    const plainEdgeId = asEdgeId('plain-edge');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: plainEdgeId,
          from: albId,
          to: ecsId,
          attributes: {
            projection: {
              layer: 'core',
            },
          },
        },
      ],
    });
    const albNode = adapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const rule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'missing' },
        },
      },
      options: { relation: 'routes' },
    });
    rule.match(albId, albNode, adapter);
    const result = rule.apply(albId, albNode, adapter);
    expect(
      result.getEdgeAttributes(plainEdgeId)?.projection?.relationship,
    ).toBe(undefined);
  });

  it('should return after out-edge assignment when enforceDirection is false', () => {
    const edgeId = asEdgeId('alb-to-ecs');
    const reverseEdgeId = asEdgeId('ecs-to-alb');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: albId,
          to: ecsId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
        {
          id: reverseEdgeId,
          from: ecsId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
      ],
    });
    const albNode = adapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const rule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: {
        relation: 'routes',
        enforceDirection: false,
      },
    });

    rule.match(albId, albNode, adapter);
    const result = rule.apply(albId, albNode, adapter);

    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship?.relation,
    ).toBe('routes');
    expect(result.edgeSource(reverseEdgeId)).toBe(ecsId);
    expect(result.edgeTarget(reverseEdgeId)).toBe(albId);
    expect(
      result.getEdgeAttributes(reverseEdgeId)?.projection?.relationship,
    ).toBe(undefined);
  });

  it('should respect full edge dsl when applying compound relationship queries', () => {
    const dynamodbId = asNodeId('projection-dynamodb');
    const edgeId = asEdgeId('dynamodb-to-lambda');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.lambda:handler',
            label: 'Lambda handler',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.lambda',
              groupKey: 'aws.lambda:handler',
              rootNodeId: asNodeId('anchor-lambda'),
              anchors: [],
            },
          },
        },
        [dynamodbId]: {
          id: dynamodbId,
          projection: {
            layer: 'core',
            address: 'aws.dynamodb:items',
            label: 'DynamoDB items',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.dynamodb',
              groupKey: 'aws.dynamodb:items',
              rootNodeId: asNodeId('anchor-dynamodb'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: edgeId,
          from: dynamodbId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
                evidence: {
                  derivedBy: 'anchor_path',
                  evidenceCount: 1,
                  shortestPathLength: 1,
                  viaResourceTypes: ['aws_lambda_event_source_mapping'],
                },
              },
            },
          },
        },
      ],
    });
    const lambdaNode = adapter.getNodeAttributes(albId);
    if (!lambdaNode) {
      throw new Error('Missing Lambda projection node');
    }

    const rule = new ProjectionAdjacencyRelationship({
      edge: {
        and: [
          {
            from: {
              attr: {
                key: 'projection.derivation.projectionName',
                eq: 'aws.lambda',
              },
            },
          },
          {
            to: {
              attr: {
                key: 'projection.derivation.projectionName',
                eq: 'aws.dynamodb',
              },
            },
          },
          {
            attr: {
              key: 'projection.adjacency.evidence.viaResourceTypes',
              contains: 'aws_lambda_event_source_mapping',
            },
          },
        ],
      },
      options: {
        relation: 'accesses',
      },
    });

    rule.match(albId, lambdaNode, adapter);
    const result = rule.apply(albId, lambdaNode, adapter);

    expect(result.edgeSource(edgeId)).toBe(albId);
    expect(result.edgeTarget(edgeId)).toBe(dynamodbId);
    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship?.relation,
    ).toBe('accesses');
  });

  it('should cover re-check mismatch and out-edge assignment branches', () => {
    const outEdgeId = asEdgeId('out-edge');
    const plainInEdgeId = asEdgeId('plain-in-edge');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: outEdgeId,
          from: albId,
          to: ecsId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
        {
          id: plainInEdgeId,
          from: ecsId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
            },
          },
        },
      ],
    });
    const albNode = adapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const assignRule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: { relation: 'routes' },
    });
    assignRule.match(albId, albNode, adapter);
    const assigned = assignRule.apply(albId, albNode, adapter);
    expect(
      assigned.getEdgeAttributes(outEdgeId)?.projection?.relationship?.relation,
    ).toBe('routes');

    const recheckRule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: { relation: 'routes' },
    });
    recheckRule.match(albId, albNode, adapter);
    const recheckNode = {
      ...albNode,
      projection: {
        layer: albNode.projection?.layer ?? 'core',
        address: albNode.projection?.address ?? 'aws.alb:public',
        label: albNode.projection?.label ?? 'ALB public',
        derivation: {
          ...(albNode.projection?.derivation ?? {
            source: 'plugin' as const,
          }),
          projectionName: 'different',
        },
      },
    };
    expect(recheckRule.apply(albId, recheckNode, adapter)).toBe(adapter);

    const plainRule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: { relation: 'routes', overwrite: true, enforceDirection: true },
    });
    plainRule.match(albId, albNode, adapter);
    const plainResult = plainRule.apply(albId, albNode, adapter);
    expect(plainResult.edgeSource(plainInEdgeId)).toBe(ecsId);
    expect(plainResult.edgeTarget(plainInEdgeId)).toBe(albId);
  });

  it('should skip plain non-adjacency edges on matching out-edges and non-matching in-edges', () => {
    const plainOutEdgeId = asEdgeId('plain-out');
    const wrongInEdgeId = asEdgeId('wrong-in');
    const otherId = asNodeId('other');
    const adapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
        [otherId]: {
          id: otherId,
          projection: {
            layer: 'core',
            address: 'other',
            label: 'Other',
            derivation: {
              source: 'plugin',
              projectionName: 'other',
              groupKey: 'other',
              rootNodeId: asNodeId('anchor-other'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: plainOutEdgeId,
          from: albId,
          to: ecsId,
          attributes: {
            projection: {
              layer: 'core',
            },
          },
        },
        {
          id: wrongInEdgeId,
          from: otherId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
      ],
    });
    const albNode = adapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const rule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: { relation: 'routes', overwrite: true, enforceDirection: true },
    });
    rule.match(albId, albNode, adapter);
    const result = rule.apply(albId, albNode, adapter);

    expect(
      result.getEdgeAttributes(plainOutEdgeId)?.projection?.relationship,
    ).toBe(undefined);
    expect(result.edgeSource(wrongInEdgeId)).toBe(otherId);
    expect(result.edgeTarget(wrongInEdgeId)).toBe(albId);
  });

  it('should skip edges whose target or source node attributes are unavailable', () => {
    const outEdgeId = asEdgeId('missing-target');
    const inEdgeId = asEdgeId('missing-source');
    const otherId = asNodeId('other');
    const baseAdapter = buildAdapter({
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [albId]: {
          id: albId,
          projection: {
            layer: 'core',
            address: 'aws.alb:public',
            label: 'ALB public',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.alb',
              groupKey: 'aws.alb:public',
              rootNodeId: asNodeId('anchor-alb'),
              anchors: [],
            },
          },
        },
        [ecsId]: {
          id: ecsId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:service',
            label: 'ECS service',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:service',
              rootNodeId: asNodeId('anchor-ecs'),
              anchors: [],
            },
          },
        },
        [otherId]: {
          id: otherId,
          projection: {
            layer: 'core',
            address: 'aws.ecs:other',
            label: 'Other',
            derivation: {
              source: 'plugin',
              projectionName: 'aws.ecs',
              groupKey: 'aws.ecs:other',
              rootNodeId: asNodeId('anchor-other'),
              anchors: [],
            },
          },
        },
      },
      edges: [
        {
          id: outEdgeId,
          from: albId,
          to: ecsId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
        {
          id: inEdgeId,
          from: otherId,
          to: albId,
          attributes: {
            projection: {
              layer: 'core',
              adjacency: {
                source: 'derived',
              },
            },
          },
        },
      ],
    });
    const albNode = baseAdapter.getNodeAttributes(albId);
    if (!albNode) {
      throw new Error('Missing ALB projection node');
    }

    const adapter = Object.create(baseAdapter) as GraphologyAdapter;
    adapter.getNodeAttributes = (nodeId) => {
      if (nodeId === ecsId || nodeId === otherId) {
        return undefined;
      }
      return baseAdapter.getNodeAttributes(nodeId);
    };

    const rule = new ProjectionAdjacencyRelationship({
      edge: {
        from: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.alb' },
        },
        to: {
          attr: { key: 'projection.derivation.projectionName', eq: 'aws.ecs' },
        },
      },
      options: { relation: 'routes' },
    });
    rule.match(albId, albNode, adapter);

    expect(rule.apply(albId, albNode, adapter)).toBe(adapter);
  });
});
