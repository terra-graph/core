export type NodeId = string & { readonly __brand: 'NodeId' };
export type EdgeId = string & { readonly __brand: 'EdgeId' };

export const TG_ID_NAMESPACE = 'tg';
export const TG_SCHEMA_VERSION = '1.0.0';

export type TgNodeKind =
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

export interface TgEdgeAttributes extends Record<string, unknown> {
  directionSemantic?: string;
  legend?: TgEdgeLegendAttribute;
  renderHints?: TgEdgeRenderHints;
  adapter?: Record<string, Record<string, unknown>>;
}

export type TgEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  attributes?: TgEdgeAttributes;
};

export type TgNodeTerraform = {
  kind?: TgNodeKind;
  address?: string;
  resource?: string;
  name?: string;
  moduleAddress?: string;
  parentModuleName?: string;
  parentModuleNodeId?: NodeId;
  state?: TgNodeTerraformState;
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
};

export type TgNodeHints = {
  label?: TgNodeLabelHints;
  layout?: TgNodeLayoutHints;
  topology?: TgNodeTopologyHints;
  cardinality?: TgNodeCardinalityHints;
};

export type TgNodeAttributes = {
  terraform?: TgNodeTerraform;
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
