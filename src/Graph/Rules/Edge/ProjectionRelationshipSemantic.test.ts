import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../../Adapters/GraphologyAdapter.js';
import {
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
} from '../../TgGraph.js';
import { ProjectionRelationshipSemantic } from './ProjectionRelationshipSemantic.js';

describe('ProjectionRelationshipSemantic.constructor', () => {
  it('shoud require options', () => {
    expect(
      () =>
        new ProjectionRelationshipSemantic({
          edge: { from: { any: true }, to: { any: true } },
        }),
    ).toThrow(
      `Rule 'ProjectionRelationshipSemantic' requires options in config`,
    );
  });

  it('shoud require options.relation', () => {
    expect(
      () =>
        new ProjectionRelationshipSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: {},
        }),
    ).toThrow(
      `Rule 'ProjectionRelationshipSemantic' requires options.relation`,
    );
  });

  it('should validate overwrite and enforceDirection option types', () => {
    expect(
      () =>
        new ProjectionRelationshipSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: { relation: 'routes', overwrite: 'yes' as never },
        }),
    ).toThrow(
      `Rule 'ProjectionRelationshipSemantic' options.overwrite must be a boolean when provided`,
    );

    expect(
      () =>
        new ProjectionRelationshipSemantic({
          edge: { from: { any: true }, to: { any: true } },
          options: { relation: 'routes', enforceDirection: 'yes' as never },
        }),
    ).toThrow(
      `Rule 'ProjectionRelationshipSemantic' options.enforceDirection must be a boolean when provided`,
    );
  });
});

describe('ProjectionRelationshipSemantic.apply', () => {
  const albId = asNodeId('projection-alb');
  const ecsId = asNodeId('projection-ecs');

  const buildAdapter = (graph: TgGraph) =>
    new GraphologyAdapter(new DirectedGraph()).withTgGraph(graph);

  it('shoud reinterpret and reverse matching projection relationship edges', () => {
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
              relationship: {
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

    const rule = new ProjectionRelationshipSemantic({
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
    });

    rule.match(albId, albNode, adapter);
    const result = rule.apply(albId, albNode, adapter);

    expect(result.edgeSource(edgeId)).toBe(albId);
    expect(result.edgeTarget(edgeId)).toBe(ecsId);
    expect(
      result.getEdgeAttributes(edgeId)?.projection?.relationship?.relation,
    ).toBe('routes');
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

    const unmatched = new ProjectionRelationshipSemantic({
      edge: { from: { nodeId: { eq: 'missing' } }, to: { any: true } },
      options: { relation: 'routes' },
    });
    unmatched.match(albId, albNode, adapter);
    expect(unmatched.apply(albId, albNode, adapter)).toBe(adapter);

    const noOverwrite = new ProjectionRelationshipSemantic({
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

  it('should skip edges whose targets do not match or that are not projection relationships', () => {
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

    const rule = new ProjectionRelationshipSemantic({
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
              relationship: {
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

    const assignRule = new ProjectionRelationshipSemantic({
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

    const recheckRule = new ProjectionRelationshipSemantic({
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

    const plainRule = new ProjectionRelationshipSemantic({
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

  it('should skip relationless plain edges on matching out-edges and non-matching in-edges', () => {
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
              relationship: {
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

    const rule = new ProjectionRelationshipSemantic({
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
});
