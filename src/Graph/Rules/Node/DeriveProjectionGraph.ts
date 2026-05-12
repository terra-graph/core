import { NodeQuery } from '../../Operations/Matchers/NodeQuery/NodeQuery.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import {
  DefaultProjectionAnchorRoles,
  DefaultProjectionInferenceMethods,
  DefaultProjectionLayers,
  DefaultProjectionMembershipRelations,
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  TgNodeProjectionAnchor,
  TgProjectionInferenceEvidence,
  TgProjectionLayer,
  TgProjectionMembershipRelation,
  edgeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';
import { NodeRuleConfig } from '../RuleConfig.js';

type ProjectionMembershipOptions = {
  maxDepth?: number;
  includeResources?: string[];
  excludeResources?: string[];
  stopAtOtherRootNodes?: boolean;
};

type ProjectionRelationshipOptions = {
  maxDepth?: number;
  minEvidence?: number;
};

export type ProjectionDefinition = {
  name: string;
  layer?: TgProjectionLayer;
  rootNode: ReturnType<NodeQuery['getDsl']>;
  membership?: ProjectionMembershipOptions;
  relationships?: ProjectionRelationshipOptions;
};

type DeriveProjectionGraphOptions = {
  projections: ProjectionDefinition[];
};

type DeriveProjectionGraphInput =
  | {
      options: unknown;
    }
  | NodeRuleConfig;

type ResolvedProjectionDefinition = ProjectionDefinition & {
  layer: TgProjectionLayer;
  membership: Required<ProjectionMembershipOptions>;
  relationships: Required<ProjectionRelationshipOptions>;
  rootNodeQuery: NodeQuery;
};

type RelationshipEvidence = {
  layer: TgProjectionLayer;
  evidenceCount: number;
  shortestPathLength?: number;
  viaResourceTypes: NonNullable<
    TgProjectionInferenceEvidence['viaResourceTypes']
  >;
  evidenceKeys: Set<string>;
};

type QueueItem = {
  current: NodeId;
  depth: number;
  path: NodeId[];
};

const PROJECTION_PAIR_KEY_DELIMITER = '->';
const WILDCARD_SEGMENT_PATTERN = '.*';

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeGroupValue = (value: string): string =>
  value.trim().length > 0 ? value.trim() : 'unknown';

export class DeriveProjectionGraph extends NodeRule {
  private readonly optionsValue: DeriveProjectionGraphOptions;

  constructor(config: DeriveProjectionGraphInput) {
    const normalizedConfig: NodeRuleConfig =
      'node' in config
        ? config
        : {
            node: {
              any: true,
            },
            options: config.options as Record<string, unknown> | undefined,
          };

    if (normalizedConfig.options === undefined) {
      throw new Error(
        `Rule '${DeriveProjectionGraph.name}' requires options in config`,
      );
    }
    super(normalizedConfig);
    this.optionsValue = DeriveProjectionGraph.parseOptions(
      normalizedConfig.options,
    );
  }

  public override apply(
    nodeId: NodeId,
    _node: TgNodeAttributes,
    graph: AdapterOperations,
  ): AdapterOperations {
    if (!this.wasMatched(nodeId)) {
      return graph;
    }

    const firstNodeId = graph.nodeIds()[0];
    if (!firstNodeId || firstNodeId !== nodeId) {
      return graph;
    }

    const resolved = this.resolveProjections();
    if (resolved.length === 0) {
      return graph;
    }

    const baseNodeIds = graph
      .nodeIds()
      .filter((current) => !graph.getNodeAttributes(current)?.projection);
    const nodeMap = new Map<NodeId, TgNodeAttributes>();
    for (const current of baseNodeIds) {
      nodeMap.set(
        current,
        graph.getNodeAttributes(current) as TgNodeAttributes,
      );
    }

    const rootNodeIdsByProjection = new Map<string, NodeId[]>();
    const projectionAddressesByDefinition = new Map<
      string,
      Map<NodeId, string>
    >();
    const projectionLabelsByDefinition = new Map<string, Map<NodeId, string>>();
    const allRootNodeIds = new Set<NodeId>();

    for (const projection of resolved) {
      const rootNodeIds = baseNodeIds.filter((current) =>
        projection.rootNodeQuery.match(
          current,
          nodeMap.get(current) as TgNodeAttributes,
          graph,
        ),
      );
      rootNodeIdsByProjection.set(projection.name, rootNodeIds);
      projectionAddressesByDefinition.set(
        projection.name,
        this.resolveProjectionAddresses(projection, rootNodeIds, nodeMap),
      );
      projectionLabelsByDefinition.set(
        projection.name,
        this.resolveProjectionLabels(
          projection,
          rootNodeIds,
          nodeMap,
          projectionAddressesByDefinition.get(projection.name),
        ),
      );
      for (const rootNodeId of rootNodeIds) {
        allRootNodeIds.add(rootNodeId);
      }
    }

    let updated = graph;
    const projectionDefinitions = new Map<
      NodeId,
      ResolvedProjectionDefinition
    >();
    const projectionRootNodes = new Map<NodeId, NodeId>();
    const memberToProjections = new Map<NodeId, Set<NodeId>>();
    const rootToProjections = new Map<NodeId, Set<NodeId>>();

    for (const projection of resolved) {
      for (const rootNodeId of rootNodeIdsByProjection.get(
        projection.name,
      ) as NodeId[]) {
        const rootNode = nodeMap.get(rootNodeId) as TgNodeAttributes;

        const projectionAddress = this.buildProjectionAddress(
          projection,
          rootNodeId,
          projectionAddressesByDefinition.get(projection.name),
        );
        const projectionNodeId = tgProjectionNodeIdFrom(
          projection.layer,
          projectionAddress,
        );
        const projectionLabel = this.buildProjectionLabel(
          projection,
          rootNodeId,
          projectionLabelsByDefinition.get(projection.name),
        );
        const existingProjection = updated.getNodeAttributes(projectionNodeId)
          ?.projection as TgNodeAttributes['projection'] | undefined;
        const anchors = this.mergeProjectionAnchors(
          existingProjection?.derivation?.anchors,
          {
            nodeId: rootNodeId,
            address: rootNode.terraform?.address,
            role: DefaultProjectionAnchorRoles.RootNode,
          },
        );

        updated = updated.setNodeAttributes(projectionNodeId, {
          projection: {
            layer: projection.layer,
            address: projectionAddress,
            label: projectionLabel,
            derivation: {
              source: existingProjection?.derivation?.source ?? 'plugin',
              projectionName:
                existingProjection?.derivation?.projectionName ??
                projection.name,
              groupKey: projectionAddress,
              rootNodeId:
                existingProjection?.derivation?.rootNodeId ?? rootNodeId,
              anchors,
            },
          },
        });

        projectionDefinitions.set(projectionNodeId, projection);
        projectionRootNodes.set(projectionNodeId, rootNodeId);
        this.addProjectionMembership(
          memberToProjections,
          projectionNodeId,
          rootNodeId,
        );
        this.addProjectionRoot(rootToProjections, projectionNodeId, rootNodeId);

        updated = updated.setEdge(
          edgeIdFrom(
            rootNodeId,
            projectionNodeId,
            `projection:${projection.name}:realizes`,
          ),
          rootNodeId,
          projectionNodeId,
          this.buildMembershipEdgeAttributes(
            projection.layer,
            DefaultProjectionMembershipRelations.Realizes,
          ),
        );

        for (const memberId of this.expandMembership(
          projection,
          rootNodeId,
          nodeMap,
          graph,
          allRootNodeIds,
        )) {
          if (memberId === rootNodeId) {
            continue;
          }
          this.addProjectionMembership(
            memberToProjections,
            projectionNodeId,
            memberId,
          );
          updated = updated.setEdge(
            edgeIdFrom(
              memberId,
              projectionNodeId,
              `projection:${projection.name}:contributes_to`,
            ),
            memberId,
            projectionNodeId,
            this.buildMembershipEdgeAttributes(
              projection.layer,
              DefaultProjectionMembershipRelations.ContributesTo,
            ),
          );
        }
      }
    }

    const adjacencyEvidence = this.inferAdjacencies(
      projectionDefinitions,
      projectionRootNodes,
      rootToProjections,
      graph,
    );

    for (const [key, evidence] of adjacencyEvidence.entries()) {
      const [from, to] = this.parseProjectionPairKey(key);
      if (evidence.evidenceCount < evidence.minEvidence) {
        continue;
      }
      updated = updated.setEdge(
        edgeIdFrom(from, to, `projection:${evidence.layer}:adjacency`),
        from,
        to,
        {
          projection: {
            layer: evidence.layer,
            adjacency: {
              source: 'derived',
              evidence: {
                derivedBy: DefaultProjectionInferenceMethods.AnchorPath,
                evidenceCount: evidence.evidenceCount,
                shortestPathLength: evidence.shortestPathLength,
                viaResourceTypes: evidence.viaResourceTypes,
              },
            },
          },
        },
      );
    }

    return updated;
  }

  private resolveProjections(): ResolvedProjectionDefinition[] {
    return this.optionsValue.projections.map((projection) => ({
      ...projection,
      layer: projection.layer ?? DefaultProjectionLayers.Core,
      membership: {
        maxDepth: projection.membership?.maxDepth ?? 0,
        includeResources: projection.membership?.includeResources ?? [],
        excludeResources: projection.membership?.excludeResources ?? [],
        stopAtOtherRootNodes:
          projection.membership?.stopAtOtherRootNodes ?? true,
      },
      relationships: {
        maxDepth: projection.relationships?.maxDepth ?? 3,
        minEvidence: projection.relationships?.minEvidence ?? 1,
      },
      rootNodeQuery: NodeQuery.from(projection.rootNode),
    }));
  }

  private expandMembership(
    projection: ResolvedProjectionDefinition,
    rootNodeId: NodeId,
    nodeMap: Map<NodeId, TgNodeAttributes>,
    graph: AdapterOperations,
    allRootNodeIds: Set<NodeId>,
  ): Set<NodeId> {
    const members = new Set<NodeId>([rootNodeId]);
    if (projection.membership.maxDepth <= 0) {
      return members;
    }

    const queue: Array<{ nodeId: NodeId; depth: number }> = [
      { nodeId: rootNodeId, depth: 0 },
    ];
    const visited = new Set<NodeId>([rootNodeId]);

    while (queue.length > 0) {
      const current = queue.shift() as { nodeId: NodeId; depth: number };

      if (current.depth >= projection.membership.maxDepth) {
        continue;
      }

      for (const neighbor of this.neighborIds(current.nodeId, graph)) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);

        const node = nodeMap.get(neighbor);
        if (!node || node.projection) {
          continue;
        }
        if (
          projection.membership.stopAtOtherRootNodes &&
          neighbor !== rootNodeId &&
          allRootNodeIds.has(neighbor)
        ) {
          continue;
        }
        if (!this.shouldIncludeMember(node, projection.membership)) {
          continue;
        }

        members.add(neighbor);
        queue.push({ nodeId: neighbor, depth: current.depth + 1 });
      }
    }

    return members;
  }

  private shouldIncludeMember(
    node: TgNodeAttributes,
    membership: ResolvedProjectionDefinition['membership'],
  ): boolean {
    const resource = node.terraform?.resource;
    if (!resource) {
      return false;
    }
    if (this.matchesAnyResourcePattern(resource, membership.excludeResources)) {
      return false;
    }
    if (
      membership.includeResources.length > 0 &&
      !this.matchesAnyResourcePattern(resource, membership.includeResources)
    ) {
      return false;
    }
    return true;
  }

  private matchesAnyResourcePattern(
    resource: string,
    patterns: string[],
  ): boolean {
    return patterns.some((pattern) =>
      this.matchesResourcePattern(resource, pattern),
    );
  }

  private matchesResourcePattern(resource: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
      return resource === pattern;
    }

    const regex = new RegExp(
      `^${pattern
        .split('*')
        .map((segment) => this.escapeRegexPattern(segment))
        .join(WILDCARD_SEGMENT_PATTERN)}$`,
    );

    return regex.test(resource);
  }

  private escapeRegexPattern(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private inferAdjacencies(
    projectionDefinitions: Map<NodeId, ResolvedProjectionDefinition>,
    projectionRootNodes: Map<NodeId, NodeId>,
    rootToProjections: Map<NodeId, Set<NodeId>>,
    graph: AdapterOperations,
  ): Map<string, RelationshipEvidence & { minEvidence: number }> {
    const evidence = new Map<
      string,
      RelationshipEvidence & { minEvidence: number }
    >();

    for (const [
      sourceProjectionId,
      sourceRootNodeId,
    ] of projectionRootNodes.entries()) {
      const projection = projectionDefinitions.get(sourceProjectionId);
      if (!projection || projection.relationships.maxDepth <= 0) {
        continue;
      }

      const queue: QueueItem[] = [
        {
          current: sourceRootNodeId,
          depth: 0,
          path: [sourceRootNodeId],
        },
      ];

      while (queue.length > 0) {
        const current = queue.shift() as QueueItem;
        if (current.depth >= projection.relationships.maxDepth) {
          continue;
        }

        for (const next of this.neighborIds(current.current, graph)) {
          if (current.path.includes(next)) {
            continue;
          }
          const nextDepth = current.depth + 1;
          const nextRootProjections = rootToProjections.get(next) ?? new Set();
          const otherProjectionIds = [...nextRootProjections].filter(
            (projectionNodeId) => projectionNodeId !== sourceProjectionId,
          );

          if (otherProjectionIds.length > 0) {
            for (const targetProjectionId of otherProjectionIds) {
              const [from, to] = this.canonicalizeProjectionPair(
                sourceProjectionId,
                targetProjectionId,
              );
              const key = this.buildProjectionPairKey(from, to);
              const fullPath = [...current.path, next];
              const evidenceKey = this.buildEvidencePathKey(fullPath);
              const existing = evidence.get(key) ?? {
                layer: projection.layer,
                evidenceCount: 0,
                shortestPathLength: undefined,
                viaResourceTypes: [],
                evidenceKeys: new Set<string>(),
                minEvidence: projection.relationships.minEvidence,
              };
              if (existing.evidenceKeys.has(evidenceKey)) {
                continue;
              }

              existing.evidenceKeys.add(evidenceKey);
              existing.evidenceCount += 1;
              existing.shortestPathLength =
                existing.shortestPathLength === undefined
                  ? nextDepth
                  : Math.min(existing.shortestPathLength, nextDepth);
              existing.minEvidence = Math.min(
                existing.minEvidence,
                projection.relationships.minEvidence,
              );
              this.addViaResourceTypes(
                existing.viaResourceTypes,
                fullPath.slice(1, -1),
                graph,
              );
              evidence.set(key, existing);
            }
            continue;
          }

          queue.push({
            current: next,
            depth: nextDepth,
            path: [...current.path, next],
          });
        }
      }
    }

    return evidence;
  }

  private canonicalizeProjectionPair(
    first: NodeId,
    second: NodeId,
  ): [NodeId, NodeId] {
    return String(first) <= String(second) ? [first, second] : [second, first];
  }

  private buildEvidencePathKey(path: NodeId[]): string {
    const forward = path.map(String).join(PROJECTION_PAIR_KEY_DELIMITER);
    const reverse = [...path]
      .reverse()
      .map(String)
      .join(PROJECTION_PAIR_KEY_DELIMITER);

    return forward <= reverse ? forward : reverse;
  }

  private addViaResourceTypes(
    target: string[],
    viaNodeIds: NodeId[],
    graph: AdapterOperations,
  ): void {
    for (const viaNodeId of viaNodeIds) {
      const resource = graph.getNodeAttributes(viaNodeId)?.terraform?.resource;
      if (!resource || target.includes(resource)) {
        continue;
      }
      target.push(resource);
    }
  }

  private buildProjectionPairKey(from: NodeId, to: NodeId): string {
    return `${String(from)}${PROJECTION_PAIR_KEY_DELIMITER}${String(to)}`;
  }

  private parseProjectionPairKey(key: string): [NodeId, NodeId] {
    const [from, to] = key.split(PROJECTION_PAIR_KEY_DELIMITER) as [
      NodeId | undefined,
      NodeId | undefined,
    ];
    if (!from || !to) {
      throw new Error(
        `Rule '${DeriveProjectionGraph.name}' encountered an invalid projection pair key '${key}'`,
      );
    }
    return [from, to];
  }

  private neighborIds(nodeId: NodeId, graph: AdapterOperations): NodeId[] {
    const combined = new Set<NodeId>([
      ...graph.inEdges(nodeId).map((edgeId) => graph.edgeSource(edgeId)),
      ...graph.outEdges(nodeId).map((edgeId) => graph.edgeTarget(edgeId)),
    ]);
    return [...combined];
  }

  private buildProjectionAddress(
    projection: ResolvedProjectionDefinition,
    rootNodeId: NodeId,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): string {
    const value =
      resolvedAddresses?.get(rootNodeId) ??
      sanitizeGroupValue(String(rootNodeId));
    return `${projection.name}:${value}`;
  }

  private buildProjectionLabel(
    _projection: ResolvedProjectionDefinition,
    rootNodeId: NodeId,
    resolvedLabels: Map<NodeId, string> | undefined,
  ): string {
    return resolvedLabels?.get(rootNodeId) ?? String(rootNodeId);
  }

  private resolveProjectionAddresses(
    _projection: ResolvedProjectionDefinition,
    rootNodeIds: NodeId[],
    nodeMap: Map<NodeId, TgNodeAttributes>,
  ): Map<NodeId, string> {
    const addresses = new Map<NodeId, string>();
    const rootNodes = rootNodeIds
      .map((rootNodeId) => ({
        rootNodeId,
        rootNode: nodeMap.get(rootNodeId),
      }))
      .filter(
        (entry): entry is { rootNodeId: NodeId; rootNode: TgNodeAttributes } =>
          entry.rootNode !== undefined,
      );

    const preferredKeys = new Map<string, NodeId[]>();
    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferred = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const matches = preferredKeys.get(preferred) ?? [];
      matches.push(rootNodeId);
      preferredKeys.set(preferred, matches);
    }

    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferred = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const matches = preferredKeys.get(preferred) as NodeId[];
      addresses.set(
        rootNodeId,
        matches.length <= 1
          ? preferred
          : sanitizeGroupValue(
              rootNode.terraform?.address ?? String(rootNodeId),
            ),
      );
    }

    return addresses;
  }

  private logicalProjectionName(
    rootNodeId: NodeId,
    rootNode: TgNodeAttributes,
  ): string {
    const parentModuleName = rootNode.terraform?.parentModuleName?.trim();
    const terraformName = rootNode.terraform?.name?.trim();
    const parts = new Set<string>();

    if (parentModuleName) {
      parts.add(parentModuleName);
    }
    if (terraformName) {
      parts.add(terraformName);
    }

    const logicalName = [...parts].join('.');
    if (logicalName) {
      return logicalName;
    }

    return (
      rootNode.terraform?.address ??
      rootNode.terraform?.resource ??
      String(rootNodeId)
    );
  }

  private resolveProjectionLabels(
    _projection: ResolvedProjectionDefinition,
    rootNodeIds: NodeId[],
    nodeMap: Map<NodeId, TgNodeAttributes>,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): Map<NodeId, string> {
    const labels = new Map<NodeId, string>();
    const preferredLabels = new Map<string, Set<string>>();
    const rootNodes = rootNodeIds
      .map((rootNodeId) => ({
        rootNodeId,
        rootNode: nodeMap.get(rootNodeId),
      }))
      .filter(
        (entry): entry is { rootNodeId: NodeId; rootNode: TgNodeAttributes } =>
          entry.rootNode !== undefined,
      );

    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferredLabel = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const projectionValue =
        resolvedAddresses?.get(rootNodeId) ??
        sanitizeGroupValue(String(rootNodeId));
      const addresses =
        preferredLabels.get(preferredLabel) ?? new Set<string>();
      addresses.add(projectionValue);
      preferredLabels.set(preferredLabel, addresses);
    }

    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferredLabel = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const addressCount = (preferredLabels.get(preferredLabel) as Set<string>)
        .size;
      if (addressCount <= 1) {
        labels.set(rootNodeId, preferredLabel);
        continue;
      }

      labels.set(
        rootNodeId,
        resolvedAddresses?.get(rootNodeId) ??
          this.logicalProjectionName(rootNodeId, rootNode),
      );
    }

    return labels;
  }

  private addProjectionMembership(
    memberToProjections: Map<NodeId, Set<NodeId>>,
    projectionNodeId: NodeId,
    memberId: NodeId,
  ) {
    const projections = memberToProjections.get(memberId) ?? new Set<NodeId>();
    projections.add(projectionNodeId);
    memberToProjections.set(memberId, projections);
  }

  private addProjectionRoot(
    rootToProjections: Map<NodeId, Set<NodeId>>,
    projectionNodeId: NodeId,
    rootNodeId: NodeId,
  ) {
    const projections = rootToProjections.get(rootNodeId) ?? new Set<NodeId>();
    projections.add(projectionNodeId);
    rootToProjections.set(rootNodeId, projections);
  }

  private buildMembershipEdgeAttributes(
    layer: TgProjectionLayer,
    relation: TgProjectionMembershipRelation,
  ): TgEdgeAttributes {
    return {
      projection: {
        layer,
        membership: {
          relation,
          source: 'derived',
        },
      },
    };
  }

  private mergeProjectionAnchors(
    existing: TgNodeProjectionAnchor[] | undefined,
    next: TgNodeProjectionAnchor,
  ): TgNodeProjectionAnchor[] {
    const merged = [...(existing ?? [])];
    const index = merged.findIndex((anchor) => anchor.nodeId === next.nodeId);
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...next,
      };
      return merged;
    }

    merged.push(next);
    return merged;
  }

  private static parseOptions(input: unknown): DeriveProjectionGraphOptions {
    if (!isObjectRecord(input) || !Array.isArray(input.projections)) {
      throw new Error(
        `Rule '${DeriveProjectionGraph.name}' requires options.projections`,
      );
    }

    const projections = input.projections.map((entry, index) => {
      if (!isObjectRecord(entry) || typeof entry.name !== 'string') {
        throw new Error(
          `Rule '${DeriveProjectionGraph.name}' projection at index ${index} requires a name`,
        );
      }
      if (!('rootNode' in entry)) {
        throw new Error(
          `Rule '${DeriveProjectionGraph.name}' projection '${entry.name}' requires a rootNode query`,
        );
      }

      return {
        name: entry.name,
        layer:
          typeof entry.layer === 'string'
            ? (entry.layer as TgProjectionLayer)
            : undefined,
        rootNode: entry.rootNode as ReturnType<NodeQuery['getDsl']>,
        membership: isObjectRecord(entry.membership)
          ? {
              maxDepth:
                typeof entry.membership.maxDepth === 'number'
                  ? entry.membership.maxDepth
                  : undefined,
              includeResources: Array.isArray(entry.membership.includeResources)
                ? entry.membership.includeResources.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : undefined,
              excludeResources: Array.isArray(entry.membership.excludeResources)
                ? entry.membership.excludeResources.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : undefined,
              stopAtOtherRootNodes:
                typeof entry.membership.stopAtOtherRootNodes === 'boolean'
                  ? entry.membership.stopAtOtherRootNodes
                  : undefined,
            }
          : undefined,
        relationships: isObjectRecord(entry.relationships)
          ? {
              maxDepth:
                typeof entry.relationships.maxDepth === 'number'
                  ? entry.relationships.maxDepth
                  : undefined,
              minEvidence:
                typeof entry.relationships.minEvidence === 'number'
                  ? entry.relationships.minEvidence
                  : undefined,
            }
          : undefined,
      } satisfies ProjectionDefinition;
    });

    return { projections };
  }
}

NodeRule.register(DeriveProjectionGraph);
