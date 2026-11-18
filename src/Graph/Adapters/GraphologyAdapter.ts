import { MultiDirectedGraph } from 'graphology';
import type { AbstractGraph as Graphology } from 'graphology-types';
import { isObjectRecord } from '../../ObjectUtilities.js';
import { AdapterOperations } from '../Operations/Operations.js';
import { JsonRenderer } from '../Renderers/JsonRenderer.js';
import {
  EdgeId,
  NodeId,
  TG_SCHEMA_VERSION,
  TgEdge,
  type TgEdgeAttributes,
  TgGraph,
  type TgGraphHints,
  type TgGraphMetadata,
  TgNode,
  TgNodeAttributes,
  TgNodeTerraform,
  type TgNodeTerraformState,
  type TgNodeTerraformStateBase,
  type TgNodeTerraformStateInstance,
  type TgTerraformChanges,
  TgTerraformNodeKind,
  asNodeId,
  isTgTerraformNodeKind,
  parseTgNodeId,
  tgNodeIdFrom,
} from '../TgGraph.js';

export enum GraphAttributeKey {
  Description = 'tg:description',
  SchemaVersion = 'tg:schemaVersion',
  Hints = 'tg:hints',
  Metadata = 'tg:metadata',
  Changes = 'tg:changes',
}

export class GraphologyAdapter implements AdapterOperations {
  constructor(
    protected readonly graph: Graphology = new MultiDirectedGraph(),
  ) {}

  public withTgGraph(tg: TgGraph): this {
    return this.mutateGraph((graph) => {
      for (const node of Object.values(tg.nodes)) {
        graph.addNode(node.id, node);
      }

      for (const edge of tg.edges) {
        graph.addEdgeWithKey(
          edge.id,
          edge.from,
          edge.to,
          edge.attributes ?? {},
        );
      }
      graph.setAttribute(GraphAttributeKey.Description, tg.description);
      graph.setAttribute(
        GraphAttributeKey.SchemaVersion,
        tg.schemaVersion ?? TG_SCHEMA_VERSION,
      );
      graph.setAttribute(GraphAttributeKey.Hints, tg.hints);
      graph.setAttribute(GraphAttributeKey.Metadata, tg.metadata);
      graph.setAttribute(GraphAttributeKey.Changes, tg.changes);
    });
  }

  public toTgGraph(): TgGraph {
    const nodes: Record<string, TgNode> = {};
    const edges: TgEdge[] = [];

    this.graph.forEachNode((nodeId, attributes) => {
      const id = asNodeId(nodeId);
      const parsed = parseTgNodeId(id);
      const attrRecord = attributes as Record<string, unknown>;
      const {
        label: _ignoredLabel,
        terraform: rawTerraform,
        ...rest
      } = attrRecord;
      const node: TgNode = {
        id,
        ...(rest as Partial<Omit<TgNode, 'id'>>),
      };

      const terraform = this.resolveTerraform(
        rawTerraform,
        parsed?.kind,
        parsed?.address,
      );
      if (terraform) {
        node.terraform = terraform;
      }
      nodes[nodeId] = node;
    });

    this.graph.forEachEdge(
      (edgeId, attributes: TgEdgeAttributes, source, target) => {
        edges.push({
          id: edgeId as EdgeId,
          from: source as NodeId,
          to: target as NodeId,
          attributes,
        });
      },
    );

    const description = this.readGraphAttribute<Record<string, string>>(
      GraphAttributeKey.Description,
      {},
    );
    const schemaVersion = this.readGraphAttribute<string>(
      GraphAttributeKey.SchemaVersion,
      TG_SCHEMA_VERSION,
    );
    const hints = this.readGraphAttribute<TgGraphHints | undefined>(
      GraphAttributeKey.Hints,
      undefined,
    );
    const metadata = this.readGraphAttribute<TgGraphMetadata | undefined>(
      GraphAttributeKey.Metadata,
      undefined,
    );
    const changes = this.readGraphAttribute<TgTerraformChanges | undefined>(
      GraphAttributeKey.Changes,
      undefined,
    );

    return {
      schemaVersion,
      nodes,
      edges,
      description,
      ...(hints !== undefined ? { hints } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(changes !== undefined ? { changes } : {}),
    };
  }

  public getRenderer<TOptions = unknown>(
    _options?: TOptions,
  ): JsonRenderer<this> {
    return new JsonRenderer<this>();
  }

  public getGraph(): Graphology {
    return this.graph.copy();
  }

  public getNodeAttributes(nodeId: NodeId): TgNodeAttributes | undefined {
    if (!this.graph.hasNode(nodeId)) {
      return undefined;
    }
    return this.graph.getNodeAttributes(nodeId) as TgNodeAttributes;
  }

  public getGraphHints(): TgGraphHints | undefined {
    return this.readGraphAttribute<TgGraphHints | undefined>(
      GraphAttributeKey.Hints,
      undefined,
    );
  }

  public getEdgeAttributes(edgeId: EdgeId): TgEdgeAttributes {
    return this.graph.getEdgeAttributes(edgeId) as TgEdgeAttributes;
  }

  public edgeSource(edgeId: EdgeId): NodeId {
    return this.graph.source(edgeId) as NodeId;
  }

  public edgeTarget(edgeId: EdgeId): NodeId {
    return this.graph.target(edgeId) as NodeId;
  }

  public nodeIds(): NodeId[] {
    return this.graph.nodes() as NodeId[];
  }

  public neighbors(nodeId: NodeId): NodeId[] {
    return this.graph.neighbors(nodeId) as NodeId[];
  }

  public predecessors(nodeId: NodeId): NodeId[] {
    return this.graph.inNeighbors(nodeId) as NodeId[];
  }

  public successors(nodeId: NodeId): NodeId[] {
    return this.graph.outNeighbors(nodeId) as NodeId[];
  }

  public inEdges(nodeId: NodeId): EdgeId[] {
    return this.graph.inEdges(nodeId) as EdgeId[];
  }

  public outEdges(nodeId: NodeId): EdgeId[] {
    return this.graph.outEdges(nodeId) as EdgeId[];
  }

  public edgesBetween(source: NodeId, target: NodeId): EdgeId[] {
    return this.graph.edges(source, target) as EdgeId[];
  }

  public setNodeAttributes(nodeId: NodeId, attributes: TgNodeAttributes): this {
    return this.mutateGraph((graph) => {
      graph.mergeNode(nodeId, attributes);
    });
  }

  public setGraphHints(hints?: TgGraphHints): this {
    return this.mutateGraph((graph) => {
      if (hints === undefined) {
        graph.removeAttribute(GraphAttributeKey.Hints);
        return;
      }
      graph.setAttribute(GraphAttributeKey.Hints, hints);
    });
  }

  public setEdge(
    edgeId: EdgeId,
    source: NodeId,
    target: NodeId,
    attributes: TgEdgeAttributes,
  ): this {
    return this.mutateGraph((graph) => {
      graph.mergeEdgeWithKey(edgeId, source, target, attributes);
    });
  }

  public removeNode(nodeId: NodeId): this {
    return this.mutateGraph((graph) => {
      graph.dropNode(nodeId);
    });
  }

  public removeEdge(edgeId: EdgeId): this {
    return this.mutateGraph((graph) => {
      graph.dropEdge(edgeId);
    });
  }

  protected readGraphAttribute<T>(key: string, fallback: T): T {
    const value = this.graph.getAttribute(key);
    if (value !== undefined && value !== null) {
      return value as T;
    }
    const attrs = this.graph.getAttributes();
    return (attrs[key] as T) ?? fallback;
  }

  protected mutateGraph(mutate: (graph: Graphology) => void): this {
    const nextGraph = this.getGraph();
    mutate(nextGraph);
    const Ctor = this.constructor as new (graph: Graphology) => this;
    return new Ctor(nextGraph);
  }

  private describeNode(
    address: string,
    kind: TgTerraformNodeKind,
  ): Pick<
    TgNodeTerraform,
    | 'resource'
    | 'name'
    | 'moduleAddress'
    | 'parentModuleName'
    | 'parentModuleNodeId'
  > {
    const segments = address.split('.');
    let index = 0;
    while (segments[index] === 'module' && segments[index + 1]) {
      index += 2;
    }
    const moduleAddress =
      index > 0 ? segments.slice(0, index).join('.') : undefined;
    const tail = segments.slice(index);

    if (kind === 'resource') {
      return {
        moduleAddress,
        ...this.parentModuleHelpers(moduleAddress),
        resource: tail[0],
        name: tail[1],
      };
    }
    if (kind === 'data') {
      return {
        moduleAddress,
        ...this.parentModuleHelpers(moduleAddress),
        resource: tail[1],
        name: tail[2],
      };
    }
    if (kind === 'local' || kind === 'var' || kind === 'output') {
      return {
        moduleAddress,
        ...this.parentModuleHelpers(moduleAddress),
        resource: kind,
        name: tail[1] ?? tail[0],
      };
    }
    if (kind === 'module') {
      const moduleSegments = segments.slice(0, index);
      const parentModuleAddress =
        moduleSegments.length > 2
          ? moduleSegments.slice(0, moduleSegments.length - 2).join('.')
          : undefined;
      return {
        moduleAddress: parentModuleAddress,
        ...this.parentModuleHelpers(parentModuleAddress),
        resource: 'module',
        name: moduleSegments[moduleSegments.length - 1] ?? address,
      };
    }
    if (kind === 'provider') {
      return {
        moduleAddress,
        ...this.parentModuleHelpers(moduleAddress),
        resource: 'provider',
        name: tail.join('.') || address,
      };
    }
    if (kind === 'root') {
      return {
        moduleAddress,
        ...this.parentModuleHelpers(moduleAddress),
        resource: 'root',
        name: 'root',
      };
    }
    if (kind === 'meta') {
      return {
        moduleAddress,
        ...this.parentModuleHelpers(moduleAddress),
        resource: 'meta',
        name: tail.join('.') || address,
      };
    }
    return {
      moduleAddress,
      ...this.parentModuleHelpers(moduleAddress),
      resource: 'terraform',
      name: address,
    };
  }

  private resolveTerraform(
    rawTerraform: unknown,
    parsedKind: string | undefined,
    parsedAddress: string | undefined,
  ): TgNodeTerraform | undefined {
    const terraform =
      rawTerraform && typeof rawTerraform === 'object'
        ? (rawTerraform as Record<string, unknown>)
        : undefined;

    const kindRaw =
      typeof terraform?.kind === 'string'
        ? terraform.kind
        : typeof parsedKind === 'string'
          ? parsedKind
          : undefined;
    const addressRaw =
      typeof terraform?.address === 'string'
        ? terraform.address
        : typeof parsedAddress === 'string'
          ? parsedAddress
          : undefined;

    if (!kindRaw || !addressRaw) {
      return undefined;
    }

    if (!isTgTerraformNodeKind(kindRaw)) {
      return undefined;
    }

    const kind = kindRaw;
    const details = this.describeNode(addressRaw, kind);
    const moduleAddress =
      typeof terraform?.moduleAddress === 'string'
        ? terraform.moduleAddress
        : details.moduleAddress;
    const parentModuleName =
      typeof terraform?.parentModuleName === 'string'
        ? terraform.parentModuleName
        : details.parentModuleName;
    const parentModuleNodeId =
      typeof terraform?.parentModuleNodeId === 'string'
        ? asNodeId(terraform.parentModuleNodeId)
        : details.parentModuleNodeId;
    const resolved: TgNodeTerraform = {
      kind,
      address: addressRaw,
      resource:
        typeof terraform?.resource === 'string'
          ? terraform.resource
          : details.resource,
      name: typeof terraform?.name === 'string' ? terraform.name : details.name,
    };
    if (moduleAddress !== undefined) {
      resolved.moduleAddress = moduleAddress;
    }
    if (parentModuleName !== undefined) {
      resolved.parentModuleName = parentModuleName;
    }
    if (parentModuleNodeId !== undefined) {
      resolved.parentModuleNodeId = parentModuleNodeId;
    }
    const state = this.resolveTerraformState(terraform?.state);
    if (state) {
      resolved.state = state;
    }
    return resolved;
  }

  private resolveTerraformState(
    value: unknown,
  ): TgNodeTerraformState | undefined {
    if (!isObjectRecord(value)) {
      return undefined;
    }

    const state = value as Record<string, unknown>;
    if (state.source !== 'state_show' && state.source !== 'plan_show') {
      return undefined;
    }

    const effective = this.resolveTerraformStateInstance(state.effective);
    if (effective === undefined) {
      return undefined;
    }

    if (!Array.isArray(state.instances)) {
      return undefined;
    }

    const instances = state.instances
      .map((entry) => this.resolveTerraformStateInstance(entry))
      .filter(
        (entry): entry is TgNodeTerraformStateInstance =>
          entry !== undefined && entry !== null,
      );

    return {
      source: state.source,
      effective,
      instances,
    };
  }

  private resolveTerraformStateInstance(
    value: unknown,
  ): TgNodeTerraformStateInstance | null | undefined {
    if (value === null) {
      return null;
    }

    if (!isObjectRecord(value)) {
      return undefined;
    }

    const base = this.resolveTerraformStateBase(value);
    if (!base) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    return {
      ...base,
      values: record.values ?? null,
    };
  }

  private resolveTerraformStateBase(
    value: Record<string, unknown>,
  ): TgNodeTerraformStateBase | undefined {
    if (typeof value.address !== 'string') {
      return undefined;
    }

    const base: TgNodeTerraformStateBase = {
      address: value.address,
    };

    if (typeof value.module_address === 'string') {
      base.module_address = value.module_address;
    }
    if (typeof value.mode === 'string') {
      base.mode = value.mode;
    }
    if (typeof value.type === 'string') {
      base.type = value.type;
    }
    if (typeof value.name === 'string') {
      base.name = value.name;
    }
    if (typeof value.index === 'number' || typeof value.index === 'string') {
      base.index = value.index;
    }
    if (typeof value.provider_name === 'string') {
      base.provider_name = value.provider_name;
    }
    if (typeof value.deposed === 'string') {
      base.deposed = value.deposed;
    }
    if (typeof value.previous_address === 'string') {
      base.previous_address = value.previous_address;
    }

    return base;
  }

  private parentModuleHelpers(
    moduleAddress: string | undefined,
  ): Pick<TgNodeTerraform, 'parentModuleName' | 'parentModuleNodeId'> {
    if (!moduleAddress) {
      return {};
    }

    const parts = moduleAddress.split('.');
    return {
      parentModuleName: parts[parts.length - 1] ?? moduleAddress,
      parentModuleNodeId: tgNodeIdFrom('module', moduleAddress),
    };
  }
}
