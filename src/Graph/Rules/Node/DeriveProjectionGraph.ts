import { NodeQuery } from '../../Operations/Matchers/NodeQuery/NodeQuery.js';
import { AdapterOperations } from '../../Operations/Operations.js';
import {
  DefaultEdgeSemanticRoles,
  DefaultProjectionAnchorRoles,
  DefaultProjectionInferenceMethods,
  DefaultProjectionLayers,
  DefaultProjectionMembershipRelations,
  DefaultProjectionRelationshipRelations,
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  TgNodeProjectionAnchor,
  TgProjectionInferenceEvidence,
  TgProjectionLayer,
  TgProjectionMembershipRelation,
  TgProjectionNodeCategory,
  TgProjectionRelationshipRelation,
  edgeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';
import { NodeRuleConfig } from '../RuleConfig.js';

type ProjectionGroupBy =
  | 'address'
  | 'name'
  | 'resource_name'
  | 'module_address'
  | 'parent_module';

type ProjectionDirection = 'in' | 'out' | 'both';

type ProjectionDisplay = {
  prefix?: string;
  from?: string;
};

type ProjectionMembershipOptions = {
  direction?: ProjectionDirection;
  maxDepth?: number;
  includeResources?: string[];
  excludeResources?: string[];
  stopAtOtherTriggers?: boolean;
};

type ProjectionRelationshipOptions = {
  relation?: TgProjectionRelationshipRelation;
  maxDepth?: number;
  minEvidence?: number;
};

export type ProjectionDerivationStrategy = {
  id: string;
  layer?: TgProjectionLayer;
  category?: TgProjectionNodeCategory;
  trigger: ReturnType<NodeQuery['getDsl']>;
  groupBy?: ProjectionGroupBy;
  display?: ProjectionDisplay;
  membership?: ProjectionMembershipOptions;
  relationships?: ProjectionRelationshipOptions;
};

type DeriveProjectionGraphOptions = {
  strategies: ProjectionDerivationStrategy[];
};

type ResolvedStrategy = ProjectionDerivationStrategy & {
  layer: TgProjectionLayer;
  groupBy?: ProjectionGroupBy;
  membership: Required<ProjectionMembershipOptions>;
  relationships: Required<ProjectionRelationshipOptions>;
  triggerQuery: NodeQuery;
};

type RelationshipEvidence = {
  relation: TgProjectionRelationshipRelation;
  strategyId: string;
  layer: TgProjectionLayer;
  evidenceCount: number;
  shortestPathLength?: number;
  samplePaths: NonNullable<TgProjectionInferenceEvidence['samplePaths']>;
};

type QueueItem = {
  current: NodeId;
  depth: number;
  path: NodeId[];
};

const MAX_SAMPLE_PATHS = 3;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getValueAtPath = (
  target: Record<string, unknown>,
  path: string,
): unknown => {
  if (!path) {
    return undefined;
  }

  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, target);
};

const sanitizeGroupValue = (value: string): string =>
  value.trim().length > 0 ? value.trim() : 'unknown';

export class DeriveProjectionGraph extends NodeRule {
  private readonly optionsValue: DeriveProjectionGraphOptions;

  constructor(config: NodeRuleConfig) {
    if (config.options === undefined) {
      throw new Error(
        `Rule '${DeriveProjectionGraph.name}' requires options in config`,
      );
    }
    super(config);
    this.optionsValue = DeriveProjectionGraph.parseOptions(config.options);
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

    const resolved = this.resolveStrategies();
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

    const triggerNodesByStrategy = new Map<string, NodeId[]>();
    const projectionAddressesByStrategy = new Map<
      string,
      Map<NodeId, string>
    >();
    const projectionLabelsByStrategy = new Map<string, Map<NodeId, string>>();
    const allTriggerNodes = new Set<NodeId>();

    for (const strategy of resolved) {
      const triggers = baseNodeIds.filter((current) =>
        strategy.triggerQuery.match(
          current,
          nodeMap.get(current) as TgNodeAttributes,
          graph,
        ),
      );
      triggerNodesByStrategy.set(strategy.id, triggers);
      projectionAddressesByStrategy.set(
        strategy.id,
        this.resolveProjectionAddresses(strategy, triggers, nodeMap),
      );
      projectionLabelsByStrategy.set(
        strategy.id,
        this.resolveProjectionLabels(
          strategy,
          triggers,
          nodeMap,
          projectionAddressesByStrategy.get(strategy.id),
        ),
      );
      for (const triggerId of triggers) {
        allTriggerNodes.add(triggerId);
      }
    }

    let updated = graph;
    const projectionMembers = new Map<NodeId, Set<NodeId>>();
    const projectionStrategies = new Map<NodeId, ResolvedStrategy>();
    const memberToProjections = new Map<NodeId, Set<NodeId>>();

    for (const strategy of resolved) {
      for (const triggerId of triggerNodesByStrategy.get(
        strategy.id,
      ) as NodeId[]) {
        const triggerNode = nodeMap.get(triggerId) as TgNodeAttributes;

        const projectionAddress = this.buildProjectionAddress(
          strategy,
          triggerId,
          projectionAddressesByStrategy.get(strategy.id),
        );
        const projectionId = tgProjectionNodeIdFrom(
          strategy.layer,
          projectionAddress,
        );
        const projectionLabel = this.buildProjectionLabel(
          strategy,
          triggerId,
          projectionLabelsByStrategy.get(strategy.id),
        );
        const existingProjection = updated.getNodeAttributes(projectionId)
          ?.projection as TgNodeAttributes['projection'] | undefined;
        const anchors = this.mergeProjectionAnchors(
          existingProjection?.derivation?.anchors,
          {
            nodeId: triggerId,
            address: triggerNode.terraform?.address,
            role: DefaultProjectionAnchorRoles.Trigger,
          },
        );

        updated = updated.setNodeAttributes(projectionId, {
          projection: {
            layer: strategy.layer,
            address: projectionAddress,
            label: projectionLabel,
            category: strategy.category,
            derivation: {
              source: existingProjection?.derivation?.source ?? 'plugin',
              strategyId:
                existingProjection?.derivation?.strategyId ?? strategy.id,
              groupKey: projectionAddress,
              primaryAnchorNodeId:
                existingProjection?.derivation?.primaryAnchorNodeId ??
                triggerId,
              anchors,
            },
          },
        });

        projectionStrategies.set(projectionId, strategy);
        this.addMember(
          projectionMembers,
          memberToProjections,
          projectionId,
          triggerId,
        );

        updated = updated.setEdge(
          edgeIdFrom(
            triggerId,
            projectionId,
            `projection:${strategy.id}:realizes`,
          ),
          triggerId,
          projectionId,
          this.buildMembershipEdgeAttributes(
            strategy.layer,
            DefaultProjectionMembershipRelations.Realizes,
          ),
        );

        for (const memberId of this.expandMembership(
          strategy,
          triggerId,
          nodeMap,
          graph,
          allTriggerNodes,
        )) {
          if (memberId === triggerId) {
            continue;
          }
          this.addMember(
            projectionMembers,
            memberToProjections,
            projectionId,
            memberId,
          );
          updated = updated.setEdge(
            edgeIdFrom(
              memberId,
              projectionId,
              `projection:${strategy.id}:contributes_to`,
            ),
            memberId,
            projectionId,
            this.buildMembershipEdgeAttributes(
              strategy.layer,
              DefaultProjectionMembershipRelations.ContributesTo,
            ),
          );
        }
      }
    }

    const relationshipEvidence = this.inferRelationships(
      projectionMembers,
      projectionStrategies,
      memberToProjections,
      graph,
    );

    for (const [key, evidence] of relationshipEvidence.entries()) {
      const [from, to] = key.split('->') as [NodeId, NodeId];
      if (evidence.evidenceCount < evidence.minEvidence) {
        continue;
      }
      updated = updated.setEdge(
        edgeIdFrom(
          from,
          to,
          `projection:${evidence.layer}:${evidence.relation}`,
        ),
        from,
        to,
        {
          projection: {
            layer: evidence.layer,
            relationship: {
              relation: evidence.relation,
              source: 'derived',
              strategyId: evidence.strategyId,
              evidence: {
                derivedBy: DefaultProjectionInferenceMethods.AnchorPath,
                evidenceCount: evidence.evidenceCount,
                shortestPathLength: evidence.shortestPathLength,
                samplePaths: evidence.samplePaths,
              },
            },
          },
          hints: {
            semantic: {
              semantic: evidence.relation,
              role: DefaultEdgeSemanticRoles.Primary,
            },
          },
        },
      );
    }

    return updated;
  }

  private resolveStrategies(): ResolvedStrategy[] {
    return this.optionsValue.strategies.map((strategy) => ({
      ...strategy,
      layer: strategy.layer ?? DefaultProjectionLayers.Core,
      groupBy: strategy.groupBy,
      membership: {
        direction: strategy.membership?.direction ?? 'both',
        maxDepth: strategy.membership?.maxDepth ?? 0,
        includeResources: strategy.membership?.includeResources ?? [],
        excludeResources: strategy.membership?.excludeResources ?? [],
        stopAtOtherTriggers: strategy.membership?.stopAtOtherTriggers ?? true,
      },
      relationships: {
        relation:
          strategy.relationships?.relation ??
          DefaultProjectionRelationshipRelations.DependsOn,
        maxDepth: strategy.relationships?.maxDepth ?? 3,
        minEvidence: strategy.relationships?.minEvidence ?? 1,
      },
      triggerQuery: NodeQuery.from(strategy.trigger),
    }));
  }

  private expandMembership(
    strategy: ResolvedStrategy,
    triggerId: NodeId,
    nodeMap: Map<NodeId, TgNodeAttributes>,
    graph: AdapterOperations,
    allTriggerNodes: Set<NodeId>,
  ): Set<NodeId> {
    const members = new Set<NodeId>([triggerId]);
    if (strategy.membership.maxDepth <= 0) {
      return members;
    }

    const queue: Array<{ nodeId: NodeId; depth: number }> = [
      { nodeId: triggerId, depth: 0 },
    ];
    const visited = new Set<NodeId>([triggerId]);

    while (queue.length > 0) {
      const current = queue.shift() as { nodeId: NodeId; depth: number };

      if (current.depth >= strategy.membership.maxDepth) {
        continue;
      }

      for (const neighbor of this.neighborIds(
        strategy.membership.direction,
        current.nodeId,
        graph,
      )) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);

        const node = nodeMap.get(neighbor);
        if (!node || node.projection) {
          continue;
        }
        if (
          strategy.membership.stopAtOtherTriggers &&
          neighbor !== triggerId &&
          allTriggerNodes.has(neighbor)
        ) {
          continue;
        }
        if (!this.shouldIncludeMember(node, strategy.membership)) {
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
    membership: ResolvedStrategy['membership'],
  ): boolean {
    const resource = node.terraform?.resource;
    if (!resource) {
      return false;
    }
    if (membership.excludeResources.includes(resource)) {
      return false;
    }
    if (
      membership.includeResources.length > 0 &&
      !membership.includeResources.includes(resource)
    ) {
      return false;
    }
    return true;
  }

  private inferRelationships(
    projectionMembers: Map<NodeId, Set<NodeId>>,
    projectionStrategies: Map<NodeId, ResolvedStrategy>,
    memberToProjections: Map<NodeId, Set<NodeId>>,
    graph: AdapterOperations,
  ): Map<string, RelationshipEvidence & { minEvidence: number }> {
    const evidence = new Map<
      string,
      RelationshipEvidence & { minEvidence: number }
    >();

    for (const [sourceProjectionId, members] of projectionMembers.entries()) {
      const strategy = projectionStrategies.get(sourceProjectionId);
      if (!strategy || strategy.relationships.maxDepth <= 0) {
        continue;
      }

      const visitedDepth = new Map<NodeId, number>();
      const queue: QueueItem[] = [...members].map((memberId) => ({
        current: memberId,
        depth: 0,
        path: [memberId],
      }));
      for (const memberId of members) {
        visitedDepth.set(memberId, 0);
      }

      while (queue.length > 0) {
        const current = queue.shift() as QueueItem;
        if (current.depth >= strategy.relationships.maxDepth) {
          continue;
        }

        for (const edgeId of graph.outEdges(current.current)) {
          const next = graph.edgeTarget(edgeId);
          const nextDepth = current.depth + 1;
          const nextMemberships = memberToProjections.get(next) ?? new Set();
          const otherProjectionIds = [...nextMemberships].filter(
            (projectionId) => projectionId !== sourceProjectionId,
          );

          if (otherProjectionIds.length > 0) {
            for (const targetProjectionId of otherProjectionIds) {
              const key = `${String(sourceProjectionId)}->${String(targetProjectionId)}`;
              const existing = evidence.get(key) ?? {
                relation: strategy.relationships.relation,
                strategyId: strategy.id,
                layer: strategy.layer,
                evidenceCount: 0,
                shortestPathLength: undefined,
                samplePaths: [],
                minEvidence: strategy.relationships.minEvidence,
              };
              existing.evidenceCount += 1;
              existing.shortestPathLength =
                existing.shortestPathLength === undefined
                  ? nextDepth
                  : Math.min(existing.shortestPathLength, nextDepth);
              const samplePaths = existing.samplePaths;
              if (samplePaths.length < MAX_SAMPLE_PATHS) {
                const fullPath = [...current.path, next];
                samplePaths.push({
                  from: fullPath[0] as NodeId,
                  to: next,
                  via: fullPath.slice(1, -1),
                });
                existing.samplePaths = samplePaths;
              }
              evidence.set(key, existing);
            }
            continue;
          }

          const visited = visitedDepth.get(next);
          if (visited !== undefined && visited <= nextDepth) {
            continue;
          }
          visitedDepth.set(next, nextDepth);
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

  private neighborIds(
    direction: ProjectionDirection,
    nodeId: NodeId,
    graph: AdapterOperations,
  ): NodeId[] {
    if (direction === 'in') {
      return graph.inEdges(nodeId).map((edgeId) => graph.edgeSource(edgeId));
    }
    if (direction === 'out') {
      return graph.outEdges(nodeId).map((edgeId) => graph.edgeTarget(edgeId));
    }

    const combined = new Set<NodeId>([
      ...graph.inEdges(nodeId).map((edgeId) => graph.edgeSource(edgeId)),
      ...graph.outEdges(nodeId).map((edgeId) => graph.edgeTarget(edgeId)),
    ]);
    return [...combined];
  }

  private buildProjectionAddress(
    strategy: ResolvedStrategy,
    triggerId: NodeId,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): string {
    const value =
      resolvedAddresses?.get(triggerId) ??
      sanitizeGroupValue(String(triggerId));
    return `${strategy.id}:${value}`;
  }

  private buildProjectionLabel(
    strategy: ResolvedStrategy,
    triggerId: NodeId,
    resolvedLabels: Map<NodeId, string> | undefined,
  ): string {
    const base = resolvedLabels?.get(triggerId) ?? String(triggerId);
    const prefix = strategy.display?.prefix?.trim();

    if (prefix) {
      return `${prefix} ${base}`.trim();
    }
    return base;
  }

  private groupValue(
    groupBy: ProjectionGroupBy,
    triggerId: NodeId,
    triggerNode: TgNodeAttributes,
  ): string {
    if (groupBy === 'address') {
      return triggerNode.terraform?.address ?? String(triggerId);
    }
    if (groupBy === 'resource_name') {
      const resource = triggerNode.terraform?.resource ?? 'resource';
      const name = triggerNode.terraform?.name ?? String(triggerId);
      return `${resource}.${name}`;
    }
    if (groupBy === 'module_address') {
      return triggerNode.terraform?.moduleAddress ?? 'root';
    }
    if (groupBy === 'parent_module') {
      return triggerNode.terraform?.parentModuleName ?? 'root';
    }
    return (
      triggerNode.terraform?.name ??
      triggerNode.terraform?.address ??
      String(triggerId)
    );
  }

  private resolveProjectionAddresses(
    strategy: ResolvedStrategy,
    triggerIds: NodeId[],
    nodeMap: Map<NodeId, TgNodeAttributes>,
  ): Map<NodeId, string> {
    const addresses = new Map<NodeId, string>();
    const triggers = triggerIds
      .map((triggerId) => ({
        triggerId,
        triggerNode: nodeMap.get(triggerId),
      }))
      .filter(
        (
          entry,
        ): entry is { triggerId: NodeId; triggerNode: TgNodeAttributes } =>
          entry.triggerNode !== undefined,
      );

    if (strategy.groupBy) {
      for (const { triggerId, triggerNode } of triggers) {
        addresses.set(
          triggerId,
          sanitizeGroupValue(
            this.groupValue(strategy.groupBy, triggerId, triggerNode),
          ),
        );
      }
      return addresses;
    }

    const preferredKeys = new Map<string, NodeId[]>();
    for (const { triggerId, triggerNode } of triggers) {
      const preferred = sanitizeGroupValue(
        this.logicalProjectionName(triggerId, triggerNode),
      );
      const matches = preferredKeys.get(preferred) ?? [];
      matches.push(triggerId);
      preferredKeys.set(preferred, matches);
    }

    for (const { triggerId, triggerNode } of triggers) {
      const preferred = sanitizeGroupValue(
        this.logicalProjectionName(triggerId, triggerNode),
      );
      const matches = preferredKeys.get(preferred) as NodeId[];
      addresses.set(
        triggerId,
        matches.length <= 1
          ? preferred
          : sanitizeGroupValue(
              triggerNode.terraform?.address ?? String(triggerId),
            ),
      );
    }

    return addresses;
  }

  private logicalProjectionName(
    triggerId: NodeId,
    triggerNode: TgNodeAttributes,
  ): string {
    const parentModuleName = triggerNode.terraform?.parentModuleName?.trim();
    const terraformName = triggerNode.terraform?.name?.trim();
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
      triggerNode.terraform?.address ??
      triggerNode.terraform?.resource ??
      String(triggerId)
    );
  }

  private resolveProjectionLabels(
    strategy: ResolvedStrategy,
    triggerIds: NodeId[],
    nodeMap: Map<NodeId, TgNodeAttributes>,
    resolvedAddresses: Map<NodeId, string> | undefined,
  ): Map<NodeId, string> {
    const labels = new Map<NodeId, string>();
    const preferredLabels = new Map<string, Set<string>>();
    const triggers = triggerIds
      .map((triggerId) => ({
        triggerId,
        triggerNode: nodeMap.get(triggerId),
      }))
      .filter(
        (
          entry,
        ): entry is { triggerId: NodeId; triggerNode: TgNodeAttributes } =>
          entry.triggerNode !== undefined,
      );

    for (const { triggerId, triggerNode } of triggers) {
      const preferredLabel = sanitizeGroupValue(
        this.preferredProjectionLabel(strategy, triggerId, triggerNode),
      );
      const projectionValue =
        resolvedAddresses?.get(triggerId) ??
        sanitizeGroupValue(String(triggerId));
      const addresses =
        preferredLabels.get(preferredLabel) ?? new Set<string>();
      addresses.add(projectionValue);
      preferredLabels.set(preferredLabel, addresses);
    }

    for (const { triggerId, triggerNode } of triggers) {
      const preferredLabel = sanitizeGroupValue(
        this.preferredProjectionLabel(strategy, triggerId, triggerNode),
      );
      const addressCount = (preferredLabels.get(preferredLabel) as Set<string>)
        .size;
      if (addressCount <= 1) {
        labels.set(triggerId, preferredLabel);
        continue;
      }

      labels.set(
        triggerId,
        resolvedAddresses?.get(triggerId) ??
          this.logicalProjectionName(triggerId, triggerNode),
      );
    }

    return labels;
  }

  private preferredProjectionLabel(
    strategy: ResolvedStrategy,
    triggerId: NodeId,
    triggerNode: TgNodeAttributes,
  ): string {
    const displayValue =
      typeof strategy.display?.from === 'string'
        ? getValueAtPath(
            triggerNode as Record<string, unknown>,
            strategy.display.from,
          )
        : undefined;

    return String(
      displayValue ?? this.logicalProjectionName(triggerId, triggerNode),
    );
  }

  private addMember(
    projectionMembers: Map<NodeId, Set<NodeId>>,
    memberToProjections: Map<NodeId, Set<NodeId>>,
    projectionId: NodeId,
    memberId: NodeId,
  ) {
    const members = projectionMembers.get(projectionId) ?? new Set<NodeId>();
    members.add(memberId);
    projectionMembers.set(projectionId, members);

    const projections = memberToProjections.get(memberId) ?? new Set<NodeId>();
    projections.add(projectionId);
    memberToProjections.set(memberId, projections);
  }

  private buildMembershipEdgeAttributes(
    layer: TgProjectionLayer,
    relation: TgProjectionMembershipRelation,
  ): TgEdgeAttributes {
    const role =
      relation === DefaultProjectionMembershipRelations.Realizes
        ? DefaultEdgeSemanticRoles.Primary
        : DefaultEdgeSemanticRoles.Supporting;

    return {
      projection: {
        layer,
        membership: {
          relation,
          source: 'derived',
        },
      },
      hints: {
        semantic: {
          semantic: relation,
          role,
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
    if (!isObjectRecord(input) || !Array.isArray(input.strategies)) {
      throw new Error(
        `Rule '${DeriveProjectionGraph.name}' requires options.strategies`,
      );
    }

    const strategies = input.strategies.map((entry, index) => {
      if (!isObjectRecord(entry) || typeof entry.id !== 'string') {
        throw new Error(
          `Rule '${DeriveProjectionGraph.name}' strategy at index ${index} requires an id`,
        );
      }
      if (!('trigger' in entry)) {
        throw new Error(
          `Rule '${DeriveProjectionGraph.name}' strategy '${entry.id}' requires a trigger query`,
        );
      }

      return {
        id: entry.id,
        layer:
          typeof entry.layer === 'string'
            ? (entry.layer as TgProjectionLayer)
            : undefined,
        category:
          typeof entry.category === 'string'
            ? (entry.category as TgProjectionNodeCategory)
            : undefined,
        trigger: entry.trigger as ReturnType<NodeQuery['getDsl']>,
        groupBy:
          typeof entry.groupBy === 'string'
            ? (entry.groupBy as ProjectionGroupBy)
            : undefined,
        display: isObjectRecord(entry.display)
          ? {
              prefix:
                typeof entry.display.prefix === 'string'
                  ? entry.display.prefix
                  : undefined,
              from:
                typeof entry.display.from === 'string'
                  ? entry.display.from
                  : undefined,
            }
          : undefined,
        membership: isObjectRecord(entry.membership)
          ? {
              direction:
                typeof entry.membership.direction === 'string'
                  ? (entry.membership.direction as ProjectionDirection)
                  : undefined,
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
              stopAtOtherTriggers:
                typeof entry.membership.stopAtOtherTriggers === 'boolean'
                  ? entry.membership.stopAtOtherTriggers
                  : undefined,
            }
          : undefined,
        relationships: isObjectRecord(entry.relationships)
          ? {
              relation:
                typeof entry.relationships.relation === 'string'
                  ? (entry.relationships
                      .relation as TgProjectionRelationshipRelation)
                  : undefined,
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
      } satisfies ProjectionDerivationStrategy;
    });

    return { strategies };
  }
}

NodeRule.register(DeriveProjectionGraph);
