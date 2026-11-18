import { TERRA_GRAPH_CORE_VERSION } from '../version.js';
import {
  DefaultEdgeSemanticRoles,
  DefaultProjectionLayers,
  EdgeId,
  NodeId,
  TG_ID_VERSION,
  TG_SCHEMA_VERSION,
  TgGraph,
  asEdgeId,
  asNodeId,
  edgeIdFrom,
  parseTgNodeId,
  tgNodeIdFrom,
  tgProjectionNodeIdFrom,
} from './TgGraph.js';

const customSemantic = (semantic: string) => ({
  semantic,
  role: DefaultEdgeSemanticRoles.Primary,
});

describe('TgGraph.edgeIdFrom', () => {
  it('should create expected id without suffix', () => {
    expect(edgeIdFrom(asNodeId('from'), asNodeId('to'))).toStrictEqual(
      `tg:${TG_ID_VERSION}:edge:from->to`,
    );
  });

  it('should create expected id with suffix', () => {
    expect(
      edgeIdFrom(asNodeId('from'), asNodeId('to'), 'suffix'),
    ).toStrictEqual(`tg:${TG_ID_VERSION}:edge:from->to:suffix`);
  });
});

describe('TgGraph.tgNodeIdFrom', () => {
  it('should create expected namespaced id', () => {
    expect(tgNodeIdFrom('resource', 'aws_s3_bucket.example')).toStrictEqual(
      `tg:${TG_ID_VERSION}:resource:aws_s3_bucket.example`,
    );
  });
});

describe('TgGraph.tgProjectionNodeIdFrom', () => {
  it('should create expected projection id', () => {
    expect(
      tgProjectionNodeIdFrom(DefaultProjectionLayers.Core, 'api.public'),
    ).toStrictEqual(`tg:${TG_ID_VERSION}:projection:core:api.public`);
  });
});

describe('TgGraph.parseTgNodeId', () => {
  it('should parse namespaced ids', () => {
    expect(
      parseTgNodeId(`tg:${TG_ID_VERSION}:resource:aws_s3_bucket.example`),
    ).toStrictEqual({
      namespace: 'tg',
      version: TG_ID_VERSION,
      kind: 'resource',
      address: 'aws_s3_bucket.example',
    });
  });

  it('should parse projection ids', () => {
    expect(
      parseTgNodeId(`tg:${TG_ID_VERSION}:projection:core:api.public`),
    ).toStrictEqual({
      namespace: 'tg',
      version: TG_ID_VERSION,
      kind: 'projection',
      address: 'core:api.public',
    });
  });

  it('should return undefined for invalid namespaces or missing addresses', () => {
    expect(parseTgNodeId('not-tg:1.0.0:resource:one')).toBeUndefined();
    expect(parseTgNodeId(`tg:${TG_ID_VERSION}:resource`)).toBeUndefined();
  });
});

describe('TgGraph.asNodeId', () => {
  it('should return the same string value, branded as a NodeId', () => {
    const id = asNodeId('node-1');
    expect(id).toBe('node-1');
    const _assert: NodeId = id;
  });
});

describe('TgGraph.asEdgeId', () => {
  it('should return the same string value, branded as an EdgeId', () => {
    const id = asEdgeId('edge-1');
    expect(id).toBe('edge-1');
    const _assert: EdgeId = id;
  });
});

describe('TgGraph.TgEdgeAttributes', () => {
  it('should allow custom direction semantic strings', () => {
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');
    const graph: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {},
      nodes: {
        [nodeA]: { id: nodeA },
        [nodeB]: { id: nodeB },
      },
      edges: [
        {
          id: asEdgeId('edge-a-b'),
          from: nodeA,
          to: nodeB,
          attributes: {
            hints: { semantic: customSemantic('custom.semantic') },
          },
        },
      ],
    };

    expect(graph.edges[0].attributes?.hints?.semantic?.semantic).toBe(
      'custom.semantic',
    );
  });
});

describe('TERRA_GRAPH_CORE_VERSION', () => {
  it('should expose the core package version', () => {
    expect(TERRA_GRAPH_CORE_VERSION).toBe('1.0.0-rc.30');
  });
});
