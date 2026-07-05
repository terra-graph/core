export type NodeId = string & { readonly __brand: 'NodeId' };
export type EdgeId = string & { readonly __brand: 'EdgeId' };

export const TG_ID_NAMESPACE = 'tg';
export const TG_SCHEMA_VERSION = '1.0.0';

export type TgTerraformNodeKind =
  | 'resource'
  | 'data'
  | 'local'
  | 'var'
  | 'output'
  | 'module'
  | 'provider'
  | 'root'
  | 'meta'
  | 'terraform';

export type TgNodeKind = TgTerraformNodeKind | 'projection';

export const isTgTerraformNodeKind = (
  value: unknown,
): value is TgTerraformNodeKind =>
  [
    'resource',
    'data',
    'local',
    'var',
    'output',
    'module',
    'provider',
    'root',
    'meta',
    'terraform',
  ].includes(value as TgTerraformNodeKind);

export type ParsedTgNodeId = {
  namespace: string;
  version: string;
  kind: string;
  address: string;
};

export type TgEdgeLegendAttribute = {
  title: string;
  colour: string;
};

export type TgEdgeRenderHints = {
  resource: string;
  name: string;
};

export type TgEdgeSemanticHint = {
  semantic: string;
  role: DefaultEdgeSemanticRole;
};

export type TgEdgeHints = {
  semantic?: TgEdgeSemanticHint;
};

export const DefaultProjectionLayers = {
  Core: 'core',
} as const;

export type TgProjectionLayer =
  (typeof DefaultProjectionLayers)[keyof typeof DefaultProjectionLayers];

export const DefaultProjectionMembershipRelations = {
  Realizes: 'realizes',
  ContributesTo: 'contributes_to',
} as const;

export type TgProjectionMembershipRelation =
  (typeof DefaultProjectionMembershipRelations)[keyof typeof DefaultProjectionMembershipRelations];

export type TgProjectionRelationshipRelation = string;

export const DefaultProjectionDerivationSources = {
  Plugin: 'plugin',
  Profile: 'profile',
  Inferred: 'inferred',
} as const;

export type TgProjectionDerivationSource =
  (typeof DefaultProjectionDerivationSources)[keyof typeof DefaultProjectionDerivationSources];

export const DefaultProjectionAnchorRoles = {
  RootNode: 'root_node',
  Member: 'member',
} as const;

export type TgProjectionAnchorRole =
  (typeof DefaultProjectionAnchorRoles)[keyof typeof DefaultProjectionAnchorRoles];

export const DefaultProjectionInferenceMethods = {
  MembershipContraction: 'membership_contraction',
  AnchorPath: 'anchor_path',
} as const;

export type TgProjectionInferenceMethod =
  (typeof DefaultProjectionInferenceMethods)[keyof typeof DefaultProjectionInferenceMethods];

export type TgProjectionMembership = {
  relation: TgProjectionMembershipRelation;
  source?: 'declared' | 'derived';
  projectionName?: string;
};

export type TgProjectionInferenceEvidence = {
  derivedBy: TgProjectionInferenceMethod;
  evidenceCount: number;
  shortestPathLength?: number;
  viaResourceTypes?: string[];
};

export type TgProjectionAdjacency = {
  source?: 'declared' | 'derived';
  emit?: boolean;
  evidence?: TgProjectionInferenceEvidence;
};

export type TgProjectionRelationship = {
  relation?: TgProjectionRelationshipRelation;
  source?: 'declared' | 'derived';
  projectionName?: string;
  evidence?: TgProjectionInferenceEvidence;
};

export type TgSemanticFactSource = 'explicit_connection' | 'permission';

export type TgSemanticFactConfidence =
  | 'exact'
  | 'structural'
  | 'heuristic'
  | 'inferred'
  | 'capability';

export type TgSemanticFact = {
  kind: string;
  from: NodeId;
  to: NodeId;
  source: TgSemanticFactSource;
  confidence: TgSemanticFactConfidence;
  decorator?: string;
  attributes?: Record<string, unknown>;
};

export type TgEdgeSemantic = {
  facts?: TgSemanticFact[];
};

export type TgProjectionSemantic = {
  facts?: TgSemanticFact[];
};

export type TgEdgeProjection = {
  layer: TgProjectionLayer;
  membership?: TgProjectionMembership;
  adjacency?: TgProjectionAdjacency;
  relationship?: TgProjectionRelationship;
  semantics?: TgProjectionSemantic;
};

export interface TgEdgeAttributes extends Record<string, unknown> {
  hints?: TgEdgeHints;
  legend?: TgEdgeLegendAttribute;
  renderHints?: TgEdgeRenderHints;
  semantic?: TgEdgeSemantic;
  projection?: TgEdgeProjection;
  adapter?: Record<string, Record<string, unknown>>;
}

export const DefaultEdgeSemanticRoles = {
  Primary: 'primary',
  Supporting: 'supporting',
} as const;

export type DefaultEdgeSemanticRole =
  (typeof DefaultEdgeSemanticRoles)[keyof typeof DefaultEdgeSemanticRoles];

export type TgEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  attributes?: TgEdgeAttributes;
};

export type TgNodeTerraform = {
  kind?: TgTerraformNodeKind;
  address?: string;
  resource?: string;
  name?: string;
  moduleAddress?: string;
  parentModuleName?: string;
  parentModuleNodeId?: NodeId;
  state?: TgNodeTerraformState;
  configuration?: TgNodeTerraformConfiguration;
};

export type TgNodeTerraformConfiguration = {
  source: 'plan_show';
  expressions?: Record<string, unknown>;
};

export type TgNodeTerraformStateBase = {
  address: string;
  module_address?: string;
  mode?: string;
  type?: string;
  name?: string;
  index?: number | string;
  provider_name?: string;
  deposed?: string;
  previous_address?: string;
};

export type TgNodeTerraformStateInstance = TgNodeTerraformStateBase & {
  values: unknown | null;
};

export type TgNodeTerraformState = {
  source: 'state_show' | 'plan_show';
  effective: TgNodeTerraformStateInstance | null;
  instances: TgNodeTerraformStateInstance[];
};

export type TgNodeProjectionAnchor = {
  nodeId: NodeId;
  address?: string;
  role?: TgProjectionAnchorRole;
};

export type TgNodeProjectionDerivation = {
  source: TgProjectionDerivationSource;
  projectionName?: string;
  groupKey?: string;
  rootNodeId?: NodeId;
  rootInstanceAddress?: string;
  instanceKey?: string;
  instanceOrdinal?: number;
  anchors?: TgNodeProjectionAnchor[];
};

export type TgNodeProjection = {
  layer: TgProjectionLayer;
  address: string;
  label: string;
  derivation?: TgNodeProjectionDerivation;
};

export type TgNodeLabelHints = {
  end?: string;
};

export type TgNodeTopologyHints = {
  scopeId?: string;
  lane?: string;
  order?: number;
  slotKey?: string;
  slotOrder?: number;
};

export type TgNodeCardinalityHints = {
  count: number;
  mode?: 'count' | 'for_each' | 'unknown';
  keys?: string[];
};

export type TgTopologyScopeLayout = {
  mode?: 'natural' | 'symmetric';
  direction?: 'horizontal' | 'vertical';
  groupId?: string;
  laneKey?: string;
  slotKey?: string;
};

export type TgTopologyScope = {
  id: string;
  label?: string;
  parentId?: string;
  order?: number;
  layout?: TgTopologyScopeLayout;
  adapter?: Record<string, Record<string, unknown>>;
};

export type TgGraphTopologyHints = {
  scopes: Record<string, TgTopologyScope>;
};

export type TgGraphHints = {
  topology?: TgGraphTopologyHints;
};

export type TgNodeLayoutHints = {
  image?: string;
  text1?: string;
  text2?: string;
  flowOrder?: number;
};

export type TgNodeHints = {
  label?: TgNodeLabelHints;
  layout?: TgNodeLayoutHints;
  topology?: TgNodeTopologyHints;
  cardinality?: TgNodeCardinalityHints;
};

export type TgNodeSemanticContext = Record<string, unknown>;

export type TgNodeSemantic = {
  contexts?: Record<string, TgNodeSemanticContext>;
};

export type TgNodeAttributes = {
  terraform?: TgNodeTerraform;
  projection?: TgNodeProjection;
  semantic?: TgNodeSemantic;
  hints?: TgNodeHints;
  adapter?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
};

export type TgNode = {
  id: NodeId;
} & TgNodeAttributes;

// Pure-data internal graph model that can be JSON serialized.
export type TgGraph = {
  schemaVersion: string;
  nodes: Record<string, TgNode>;
  // edges reference node ids to keep the model normalized.
  edges: TgEdge[];
  description: Record<string, string>;
  hints?: TgGraphHints;
};

export const edgeIdFrom = (
  from: NodeId,
  to: NodeId,
  suffix?: string,
  version = TG_SCHEMA_VERSION,
): EdgeId => {
  const base = `${TG_ID_NAMESPACE}:${version}:edge:${from}->${to}`;
  return (suffix ? `${base}:${suffix}` : base) as EdgeId;
};

export const tgNodeIdFrom = (
  kind: TgNodeKind,
  address: string,
  version = TG_SCHEMA_VERSION,
): NodeId => `${TG_ID_NAMESPACE}:${version}:${kind}:${address}` as NodeId;

export const tgProjectionNodeIdFrom = (
  layer: TgProjectionLayer,
  address: string,
  version = TG_SCHEMA_VERSION,
): NodeId =>
  `${TG_ID_NAMESPACE}:${version}:projection:${layer}:${address}` as NodeId;

export const parseTgNodeId = (
  value: NodeId | string,
): ParsedTgNodeId | undefined => {
  const nodeId = String(value);
  const parts = nodeId.split(':');
  if (parts.length < 4) {
    return undefined;
  }
  const [namespace, version, kind, ...addressParts] = parts;
  if (namespace !== TG_ID_NAMESPACE || addressParts.length === 0) {
    return undefined;
  }
  return {
    namespace,
    version,
    kind,
    address: addressParts.join(':'),
  };
};

export const asNodeId = (value: string): NodeId => value as NodeId;
export const asEdgeId = (value: string): EdgeId => value as EdgeId;
