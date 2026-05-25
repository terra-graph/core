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
  emitAdjacency?: boolean;
  includeViaResources?: string[];
  excludeViaResources?: string[];
  requireViaResources?: string[];
};

export const ProjectionInstanceStrategies = {
  None: 'none',
  MatchByKey: 'match_by_key',
} as const;

export type ProjectionInstanceStrategyName =
  (typeof ProjectionInstanceStrategies)[keyof typeof ProjectionInstanceStrategies];

export type ProjectionDefinition = {
  name: string;
  layer?: TgProjectionLayer;
  rootNode: ReturnType<NodeQuery['getDsl']>;
  membership?: ProjectionMembershipOptions;
  relationships?: ProjectionRelationshipOptions;
};

type DeriveProjectionGraphOptions = {
  projections: ProjectionDefinition[];
  instanceStrategy: ProjectionInstanceStrategyName;
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
  emitAdjacency: boolean;
};

type QueueItem = {
  current: NodeId;
  depth: number;
  path: NodeId[];
};

type ProjectionInstanceSeed = {
  projectionAddress: string;
  projectionLabel: string;
  groupKey: string;
  rootInstanceAddress?: string;
  instanceKey?: string;
  instanceOrdinal?: number;
  isSingleton: boolean;
};

type ProjectionInstance = ProjectionInstanceSeed & {
  projectionNodeId: NodeId;
  rootNodeId: NodeId;
};

type ProjectionInstanceExpansionInput = {
  groupKey: string;
  label: string;
  rootNode: TgNodeAttributes;
};

type ProjectionInstanceStrategy = {
  expand(input: ProjectionInstanceExpansionInput): ProjectionInstanceSeed[];
  canRelate(source: ProjectionInstance, target: ProjectionInstance): boolean;
};

type DeriveProjectionGraphDependencies = {
  instanceStrategies?: Partial<
    Record<ProjectionInstanceStrategyName, ProjectionInstanceStrategy>
  >;
};

const PROJECTION_PAIR_KEY_DELIMITER = '->';
const WILDCARD_SEGMENT_PATTERN = '.*';

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeGroupValue = (value: string): string =>
  value.trim().length > 0 ? value.trim() : 'unknown';

type ParsedTerraformInstanceAddress = {
  baseAddress: string;
  key?: string;
  ordinal?: number;
};

const parseTerraformInstanceAddress = (
  address: string,
): ParsedTerraformInstanceAddress => {
  const match = address.match(/^(.*)\[(.+)\]$/);
  if (!match) {
    return {
      baseAddress: address,
    };
  }

  const [, baseAddress, rawIndex] = match;
  const indexValue = rawIndex.trim();
  if (/^-?\d+$/.test(indexValue)) {
    return {
      baseAddress,
      key: indexValue,
      ordinal: Number(indexValue),
    };
  }

  if (indexValue.startsWith('"') && indexValue.endsWith('"')) {
    try {
      return {
        baseAddress,
        key: JSON.parse(indexValue) as string,
      };
    } catch {
      // Fall through and use the raw key when the index is not valid JSON.
    }
  }

  return {
    baseAddress,
    key: indexValue,
  };
};

const baseTerraformAddress = (
  address: string | undefined,
): string | undefined =>
  typeof address === 'string'
    ? parseTerraformInstanceAddress(address).baseAddress
    : undefined;

const baseTerraformName = (name: string | undefined): string | undefined =>
  typeof name === 'string'
    ? parseTerraformInstanceAddress(name).baseAddress
    : undefined;

const isProjectionInstanceStrategyName = (
  value: unknown,
): value is ProjectionInstanceStrategyName =>
  value === ProjectionInstanceStrategies.None ||
  value === ProjectionInstanceStrategies.MatchByKey;

const formatProjectionInstanceSuffix = (key: string): string => {
  if (/^-?\d+$/.test(key)) {
    return `[${key}]`;
  }

  return `[${JSON.stringify(key)}]`;
};

class NoProjectionInstancesStrategy implements ProjectionInstanceStrategy {
  public expand({
    groupKey,
    label,
  }: ProjectionInstanceExpansionInput): ProjectionInstanceSeed[] {
    return [
      {
        projectionAddress: groupKey,
        projectionLabel: label,
        groupKey,
        isSingleton: true,
      },
    ];
  }

  public canRelate(
    _source: ProjectionInstance,
    _target: ProjectionInstance,
  ): boolean {
    return true;
  }
}

class MatchByKeyProjectionInstancesStrategy
  implements ProjectionInstanceStrategy
{
  public expand({
    groupKey,
    label,
    rootNode,
  }: ProjectionInstanceExpansionInput): ProjectionInstanceSeed[] {
    const rootAddressInstance = this.explicitRootAddressInstance(rootNode);
    if (rootAddressInstance) {
      return [this.buildIndexedSeed(groupKey, label, rootAddressInstance)];
    }

    const instances = rootNode.terraform?.state?.instances ?? [];
    if (instances.length === 0) {
      return new NoProjectionInstancesStrategy().expand({
        groupKey,
        label,
        rootNode,
      });
    }

    const seeds = instances.map((instance, index) =>
      this.buildSeedFromStateInstance(
        groupKey,
        label,
        instance.address,
        instance.index,
        index,
      ),
    );
    if (
      instances.length === 1 &&
      seeds[0] &&
      seeds[0].instanceKey === undefined &&
      seeds[0].instanceOrdinal === undefined
    ) {
      return new NoProjectionInstancesStrategy().expand({
        groupKey,
        label,
        rootNode,
      });
    }

    return seeds;
  }

  public canRelate(
    source: ProjectionInstance,
    target: ProjectionInstance,
  ): boolean {
    if (source.isSingleton || target.isSingleton) {
      return true;
    }

    if (!source.instanceKey || !target.instanceKey) {
      return false;
    }

    return source.instanceKey === target.instanceKey;
  }

  private explicitRootAddressInstance(
    rootNode: TgNodeAttributes,
  ):
    | Omit<
        ProjectionInstanceSeed,
        'projectionAddress' | 'projectionLabel' | 'groupKey' | 'isSingleton'
      >
    | undefined {
    const rootAddress = rootNode.terraform?.address;
    if (!rootAddress) {
      return undefined;
    }

    const parsed = parseTerraformInstanceAddress(rootAddress);
    if (parsed.key === undefined && parsed.ordinal === undefined) {
      return undefined;
    }

    return {
      rootInstanceAddress: rootAddress,
      instanceKey: parsed.key,
      instanceOrdinal: parsed.ordinal,
    };
  }

  private buildSeedFromStateInstance(
    groupKey: string,
    label: string,
    instanceAddress: string,
    indexValue: number | string | undefined,
    defaultOrdinal: number,
  ): ProjectionInstanceSeed {
    const parsed = parseTerraformInstanceAddress(instanceAddress);
    let instanceKey = parsed.key;
    if (typeof indexValue === 'number') {
      instanceKey = String(indexValue);
    } else if (typeof indexValue === 'string' && indexValue.length > 0) {
      instanceKey = indexValue;
    }

    let instanceOrdinal = parsed.ordinal;
    if (typeof indexValue === 'number') {
      instanceOrdinal = indexValue;
    } else if (instanceOrdinal === undefined && instanceKey !== undefined) {
      instanceOrdinal = defaultOrdinal;
    }

    if (instanceKey === undefined && instanceOrdinal === undefined) {
      return {
        projectionAddress: groupKey,
        projectionLabel: label,
        groupKey,
        rootInstanceAddress: instanceAddress,
        isSingleton: true,
      };
    }

    return this.buildIndexedSeed(groupKey, label, {
      rootInstanceAddress: instanceAddress,
      instanceKey,
      instanceOrdinal,
    });
  }

  private buildIndexedSeed(
    groupKey: string,
    label: string,
    seed: Omit<
      ProjectionInstanceSeed,
      'projectionAddress' | 'projectionLabel' | 'groupKey' | 'isSingleton'
    >,
  ): ProjectionInstanceSeed {
    let suffixKey = seed.instanceKey;
    if (suffixKey === undefined && seed.instanceOrdinal !== undefined) {
      suffixKey = String(seed.instanceOrdinal);
    }
    if (suffixKey === undefined) {
      return {
        projectionAddress: groupKey,
        projectionLabel: label,
        groupKey,
        ...seed,
        isSingleton: true,
      };
    }

    const suffix = formatProjectionInstanceSuffix(suffixKey);
    return {
      projectionAddress: `${groupKey}${suffix}`,
      projectionLabel: `${label}${suffix}`,
      groupKey,
      ...seed,
      isSingleton: false,
    };
  }
}

const DEFAULT_PROJECTION_INSTANCE_STRATEGIES: Record<
  ProjectionInstanceStrategyName,
  ProjectionInstanceStrategy
> = {
  [ProjectionInstanceStrategies.None]: new NoProjectionInstancesStrategy(),
  [ProjectionInstanceStrategies.MatchByKey]:
    new MatchByKeyProjectionInstancesStrategy(),
};

export class DeriveProjectionGraph extends NodeRule {
  private readonly optionsValue: DeriveProjectionGraphOptions;
  private readonly instanceStrategy: ProjectionInstanceStrategy;

  constructor(config: DeriveProjectionGraphInput, ...args: unknown[]) {
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
    const dependencies = this.resolveDependencies(args[0]);
    const instanceStrategyName = this.optionsValue.instanceStrategy;
    this.instanceStrategy =
      dependencies.instanceStrategies?.[instanceStrategyName] ??
      DEFAULT_PROJECTION_INSTANCE_STRATEGIES[instanceStrategyName];
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
    const projectionInstances = new Map<NodeId, ProjectionInstance>();
    const memberToProjections = new Map<NodeId, Set<NodeId>>();

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
        const projectionLabel = this.buildProjectionLabel(
          projection,
          rootNodeId,
          projectionLabelsByDefinition.get(projection.name),
        );
        const projectionSeeds = this.instanceStrategy.expand({
          groupKey: projectionAddress,
          label: projectionLabel,
          rootNode,
        });

        for (const seed of projectionSeeds) {
          const projectionNodeId = tgProjectionNodeIdFrom(
            projection.layer,
            seed.projectionAddress,
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
          const rootInstanceAddress =
            existingProjection?.derivation?.rootInstanceAddress ??
            seed.rootInstanceAddress;
          const instanceKey =
            existingProjection?.derivation?.instanceKey ?? seed.instanceKey;
          const instanceOrdinal =
            existingProjection?.derivation?.instanceOrdinal ??
            seed.instanceOrdinal;
          const derivation = {
            source: existingProjection?.derivation?.source ?? 'plugin',
            projectionName:
              existingProjection?.derivation?.projectionName ?? projection.name,
            groupKey: existingProjection?.derivation?.groupKey ?? seed.groupKey,
            rootNodeId:
              existingProjection?.derivation?.rootNodeId ?? rootNodeId,
            ...(rootInstanceAddress !== undefined
              ? { rootInstanceAddress }
              : {}),
            ...(instanceKey !== undefined ? { instanceKey } : {}),
            ...(instanceOrdinal !== undefined ? { instanceOrdinal } : {}),
            anchors,
          };

          updated = updated.setNodeAttributes(projectionNodeId, {
            projection: {
              layer: projection.layer,
              address: seed.projectionAddress,
              label: seed.projectionLabel,
              derivation,
            },
          });

          projectionDefinitions.set(projectionNodeId, projection);
          projectionRootNodes.set(projectionNodeId, rootNodeId);
          projectionInstances.set(projectionNodeId, {
            ...seed,
            projectionNodeId,
            rootNodeId,
          });
          this.addProjectionMembership(
            memberToProjections,
            projectionNodeId,
            rootNodeId,
          );

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
    }

    const adjacencyEvidence = this.inferAdjacencies(
      projectionDefinitions,
      projectionRootNodes,
      projectionInstances,
      memberToProjections,
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
              emit: evidence.emitAdjacency || undefined,
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
        maxDepth: projection.relationships?.maxDepth ?? 0,
        minEvidence: projection.relationships?.minEvidence ?? 1,
        emitAdjacency: projection.relationships?.emitAdjacency ?? false,
        includeViaResources:
          projection.relationships?.includeViaResources ?? [],
        excludeViaResources:
          projection.relationships?.excludeViaResources ?? [],
        requireViaResources:
          projection.relationships?.requireViaResources ?? [],
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
    projectionInstances: Map<NodeId, ProjectionInstance>,
    memberToProjections: Map<NodeId, Set<NodeId>>,
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
          const nextMemberProjections =
            memberToProjections.get(next) ?? new Set();
          const otherProjectionIds = [...nextMemberProjections].filter(
            (projectionNodeId) => projectionNodeId !== sourceProjectionId,
          );

          if (otherProjectionIds.length > 0) {
            const fullPath = [...current.path, next];
            const viaResourceTypes = this.collectRelationshipViaResourceTypes(
              fullPath,
              next,
              otherProjectionIds,
              projectionRootNodes,
              graph,
            );
            if (
              !this.shouldIncludeRelationshipPath(
                viaResourceTypes,
                projection.relationships,
              )
            ) {
              continue;
            }

            for (const targetProjectionId of otherProjectionIds) {
              const sourceInstance =
                projectionInstances.get(sourceProjectionId);
              const targetInstance =
                projectionInstances.get(targetProjectionId);
              if (
                !sourceInstance ||
                !targetInstance ||
                !this.instanceStrategy.canRelate(sourceInstance, targetInstance)
              ) {
                continue;
              }

              const [from, to] = this.canonicalizeProjectionPair(
                sourceProjectionId,
                targetProjectionId,
              );
              const key = this.buildProjectionPairKey(from, to);
              const evidenceKey = this.buildEvidencePathKey(fullPath);
              const existing = evidence.get(key) ?? {
                layer: projection.layer,
                evidenceCount: 0,
                shortestPathLength: undefined,
                viaResourceTypes: [],
                evidenceKeys: new Set<string>(),
                minEvidence: projection.relationships.minEvidence,
                emitAdjacency: projection.relationships.emitAdjacency,
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
              existing.emitAdjacency =
                existing.emitAdjacency ||
                projection.relationships.emitAdjacency;
              this.addViaResourceTypes(
                existing.viaResourceTypes,
                viaResourceTypes,
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
    viaResourceTypes: string[],
  ): void {
    for (const resource of viaResourceTypes) {
      if (target.includes(resource)) {
        continue;
      }
      target.push(resource);
    }
  }

  private collectViaResourceTypes(
    viaNodeIds: NodeId[],
    graph: AdapterOperations,
  ): string[] {
    const resources: string[] = [];
    for (const viaNodeId of viaNodeIds) {
      const resource = graph.getNodeAttributes(viaNodeId)?.terraform?.resource;
      if (!resource || resources.includes(resource)) {
        continue;
      }
      resources.push(resource);
    }
    return resources;
  }

  private collectRelationshipViaResourceTypes(
    path: NodeId[],
    terminalNodeId: NodeId,
    targetProjectionIds: NodeId[],
    projectionRootNodes: Map<NodeId, NodeId>,
    graph: AdapterOperations,
  ): string[] {
    const resources = this.collectViaResourceTypes(path.slice(1, -1), graph);
    const touchesTargetMember = targetProjectionIds.some(
      (projectionNodeId) =>
        projectionRootNodes.get(projectionNodeId) !== terminalNodeId,
    );
    if (!touchesTargetMember) {
      return resources;
    }

    const terminalResource =
      graph.getNodeAttributes(terminalNodeId)?.terraform?.resource;
    if (!terminalResource || resources.includes(terminalResource)) {
      return resources;
    }

    resources.push(terminalResource);
    return resources;
  }

  private shouldIncludeRelationshipPath(
    viaResourceTypes: string[],
    relationships: ResolvedProjectionDefinition['relationships'],
  ): boolean {
    if (
      viaResourceTypes.some((resource) =>
        this.matchesAnyResourcePattern(
          resource,
          relationships.excludeViaResources,
        ),
      )
    ) {
      return false;
    }

    if (
      relationships.includeViaResources.length > 0 &&
      viaResourceTypes.some(
        (resource) =>
          !this.matchesAnyResourcePattern(
            resource,
            relationships.includeViaResources,
          ),
      )
    ) {
      return false;
    }

    if (
      relationships.requireViaResources.length > 0 &&
      !viaResourceTypes.some((resource) =>
        this.matchesAnyResourcePattern(
          resource,
          relationships.requireViaResources,
        ),
      )
    ) {
      return false;
    }

    return true;
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

    const preferredKeys = new Map<string, Set<string>>();
    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferred = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const matches = preferredKeys.get(preferred) ?? new Set<string>();
      matches.add(this.projectionBaseIdentity(rootNodeId, rootNode));
      preferredKeys.set(preferred, matches);
    }

    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferred = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const matches = preferredKeys.get(preferred) as Set<string>;
      addresses.set(
        rootNodeId,
        matches.size <= 1
          ? preferred
          : sanitizeGroupValue(
              this.projectionBaseIdentity(rootNodeId, rootNode),
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
    const terraformName = baseTerraformName(rootNode.terraform?.name?.trim());
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
      baseTerraformAddress(rootNode.terraform?.address) ??
      rootNode.terraform?.address ??
      rootNode.terraform?.resource ??
      String(rootNodeId)
    );
  }

  private projectionBaseIdentity(
    rootNodeId: NodeId,
    rootNode: TgNodeAttributes,
  ): string {
    return sanitizeGroupValue(
      baseTerraformAddress(rootNode.terraform?.address) ??
        rootNode.terraform?.address ??
        String(rootNodeId),
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
    const preferredBaseIdentities = new Map<string, Set<string>>();
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
      const baseIdentities =
        preferredBaseIdentities.get(preferredLabel) ?? new Set<string>();
      baseIdentities.add(this.projectionBaseIdentity(rootNodeId, rootNode));
      preferredBaseIdentities.set(preferredLabel, baseIdentities);
    }

    for (const { rootNodeId, rootNode } of rootNodes) {
      const preferredLabel = sanitizeGroupValue(
        this.logicalProjectionName(rootNodeId, rootNode),
      );
      const addressCount = (preferredLabels.get(preferredLabel) as Set<string>)
        .size;
      const baseIdentityCount = (
        preferredBaseIdentities.get(preferredLabel) as Set<string>
      ).size;
      if (addressCount <= 1 || baseIdentityCount <= 1) {
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

  private resolveDependencies(
    value: unknown,
  ): DeriveProjectionGraphDependencies {
    return isObjectRecord(value)
      ? (value as DeriveProjectionGraphDependencies)
      : {};
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
              emitAdjacency:
                typeof entry.relationships.emitAdjacency === 'boolean'
                  ? entry.relationships.emitAdjacency
                  : undefined,
              includeViaResources: Array.isArray(
                entry.relationships.includeViaResources,
              )
                ? entry.relationships.includeViaResources.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : undefined,
              excludeViaResources: Array.isArray(
                entry.relationships.excludeViaResources,
              )
                ? entry.relationships.excludeViaResources.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : undefined,
              requireViaResources: Array.isArray(
                entry.relationships.requireViaResources,
              )
                ? entry.relationships.requireViaResources.filter(
                    (item): item is string => typeof item === 'string',
                  )
                : undefined,
            }
          : undefined,
      } satisfies ProjectionDefinition;
    });

    return {
      projections,
      instanceStrategy: isProjectionInstanceStrategyName(input.instanceStrategy)
        ? input.instanceStrategy
        : ProjectionInstanceStrategies.None,
    };
  }
}

NodeRule.register(DeriveProjectionGraph);
