import { AdapterOperations } from '../../Operations/Operations.js';
import {
  DefaultProjectionAnchorRoles,
  DefaultProjectionDerivationSources,
  DefaultProjectionMembershipRelations,
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
  TgNodeProjectionAnchor,
  TgNodeProjectionDerivation,
  edgeIdFrom,
  tgProjectionNodeIdFrom,
} from '../../TgGraph.js';
import { NodeRule } from '../Rule.js';
import { NodeRuleConfig } from '../RuleConfig.js';
import {
  ProjectionInstanceStrategies,
  type ProjectionInstanceStrategyName,
} from './DeriveProjectionGraph.js';

type MaterializeProjectionInstancesInput =
  | {
      options: unknown;
    }
  | NodeRuleConfig;

type MaterializeProjectionInstancesOptions = {
  instanceStrategy?: ProjectionInstanceStrategyName;
};

type ParsedTerraformInstanceAddress = {
  baseAddress: string;
  key?: string;
  ordinal?: number;
};

type ParsedTerraformAddressScope = {
  moduleKeys: string[];
  terminalKey?: string;
  terminalOrdinal?: number;
};

type NormalizedInstanceSeed = {
  rootInstanceAddress: string;
  instanceKey?: string;
  instanceOrdinal?: number;
};

type ProjectionInstanceSeed = {
  rootNodeId: NodeId;
  projectionAddress: string;
  projectionLabel: string;
  groupKey: string;
  rootInstanceAddress?: string;
  instanceKey?: string;
  instanceOrdinal?: number;
  isSingleton: boolean;
  anchors: TgNodeProjectionAnchor[];
};

type ProjectionInstance = ProjectionInstanceSeed & {
  projectionNodeId: NodeId;
  layer: string;
};

type ProjectionInstancePair = {
  source: ProjectionInstance;
  target: ProjectionInstance;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isProjectionInstanceStrategyName = (
  value: unknown,
): value is ProjectionInstanceStrategyName =>
  value === ProjectionInstanceStrategies.None ||
  value === ProjectionInstanceStrategies.MatchByKey;

const hasFullKeyCoverage = (instances: ProjectionInstance[]): boolean =>
  instances.every((instance) => instance.instanceKey !== undefined);

const keysEqual = (
  source: ProjectionInstance[],
  target: ProjectionInstance[],
): boolean => {
  const sourceKeys = source.map((instance) => instance.instanceKey).sort();
  const targetKeys = target.map((instance) => instance.instanceKey).sort();
  return JSON.stringify(sourceKeys) === JSON.stringify(targetKeys);
};

const hasFullOrdinalCoverage = (instances: ProjectionInstance[]): boolean =>
  instances.every((instance) => instance.instanceOrdinal !== undefined);

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
      // Fall back to the raw segment below.
    }
  }

  return {
    baseAddress,
    key: indexValue,
  };
};

const MODULE_INSTANCE_PATTERN = /module\.[^.[\]]+\[([^[\]]+)\]/g;

const parseTerraformIndexValue = (
  rawIndex: string,
): { key: string; ordinal?: number } => {
  const indexValue = rawIndex.trim();
  if (/^-?\d+$/.test(indexValue)) {
    return {
      key: indexValue,
      ordinal: Number(indexValue),
    };
  }

  if (indexValue.startsWith('"') && indexValue.endsWith('"')) {
    try {
      return {
        key: JSON.parse(indexValue) as string,
      };
    } catch {
      // Fall back to the raw value below.
    }
  }

  return {
    key: indexValue,
  };
};

const parseTerraformAddressScope = (
  address: string,
): ParsedTerraformAddressScope => {
  const moduleKeys: string[] = [];
  for (const match of address.matchAll(MODULE_INSTANCE_PATTERN)) {
    const rawIndex = match[1];
    if (!rawIndex) {
      continue;
    }
    moduleKeys.push(parseTerraformIndexValue(rawIndex).key);
  }

  const parsedTerminal = parseTerraformInstanceAddress(address);
  return {
    moduleKeys,
    terminalKey: parsedTerminal.key,
    terminalOrdinal: parsedTerminal.ordinal,
  };
};

const serializeInstanceKeyParts = (parts: string[]): string | undefined => {
  if (parts.length === 0) {
    return undefined;
  }

  return parts.length === 1 ? parts[0] : parts.join('/');
};

const normalizeStateInstanceSeeds = (
  instances: Array<{
    address: string;
    index?: number | string;
  }>,
): NormalizedInstanceSeed[] => {
  const scopedInstances = instances.map((instance, defaultOrdinal) => {
    const scope = parseTerraformAddressScope(instance.address);
    const terminalKey =
      typeof instance.index === 'number' ||
      (typeof instance.index === 'string' && instance.index.length > 0)
        ? String(instance.index)
        : scope.terminalKey;
    const terminalOrdinal =
      typeof instance.index === 'number'
        ? instance.index
        : (scope.terminalOrdinal ??
          (terminalKey === undefined ? undefined : defaultOrdinal));

    return {
      address: instance.address,
      moduleKeys: scope.moduleKeys,
      terminalKey,
      terminalOrdinal,
      defaultOrdinal,
    };
  });

  const moduleScopedInstances = scopedInstances.filter(
    (instance) => instance.moduleKeys.length > 0,
  );
  const distinctModuleTerminalKeys = new Set(
    moduleScopedInstances.map((instance) => instance.terminalKey ?? ''),
  );
  const dropModuleTerminalKey =
    moduleScopedInstances.length > 0 && distinctModuleTerminalKeys.size <= 1;

  return scopedInstances.map((instance) => {
    const keyParts = [...instance.moduleKeys];
    if (
      instance.terminalKey !== undefined &&
      !(instance.moduleKeys.length > 0 && dropModuleTerminalKey)
    ) {
      keyParts.push(instance.terminalKey);
    }

    return {
      rootInstanceAddress: instance.address,
      instanceKey: serializeInstanceKeyParts(keyParts),
      instanceOrdinal:
        instance.terminalOrdinal ??
        (keyParts.length > 0 ? instance.defaultOrdinal : undefined),
    };
  });
};

const formatProjectionInstanceSuffix = (key: string): string => {
  if (/^-?\d+$/.test(key)) {
    return `[${key}]`;
  }

  return `[${JSON.stringify(key)}]`;
};

const buildProjectionInstanceSeed = (
  rootNodeId: NodeId,
  groupKey: string,
  label: string,
  seed: {
    rootInstanceAddress?: string;
    instanceKey?: string;
    instanceOrdinal?: number;
    anchors: TgNodeProjectionAnchor[];
  },
): ProjectionInstanceSeed => {
  const anchors = seed.anchors;
  const suffixKey =
    seed.instanceKey ??
    (seed.instanceOrdinal !== undefined
      ? String(seed.instanceOrdinal)
      : undefined);

  if (suffixKey === undefined) {
    return {
      rootNodeId,
      projectionAddress: groupKey,
      projectionLabel: label,
      groupKey,
      rootInstanceAddress: seed.rootInstanceAddress,
      anchors,
      isSingleton: true,
    };
  }

  const suffix = formatProjectionInstanceSuffix(suffixKey);
  return {
    rootNodeId,
    projectionAddress: `${groupKey}${suffix}`,
    projectionLabel: `${label}${suffix}`,
    groupKey,
    rootInstanceAddress: seed.rootInstanceAddress,
    instanceKey: seed.instanceKey,
    instanceOrdinal: seed.instanceOrdinal,
    anchors,
    isSingleton: false,
  };
};

export class MaterializeProjectionInstances extends NodeRule {
  private readonly optionsValue: MaterializeProjectionInstancesOptions;

  constructor(config: MaterializeProjectionInstancesInput) {
    const normalizedConfig: NodeRuleConfig =
      'node' in config
        ? config
        : {
            node: {
              any: true,
            },
            options: config.options as Record<string, unknown> | undefined,
          };

    super(normalizedConfig);
    this.optionsValue = MaterializeProjectionInstances.parseOptions(
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

    if (
      this.optionsValue.instanceStrategy !==
      ProjectionInstanceStrategies.MatchByKey
    ) {
      return graph;
    }

    const logicalProjectionIds = graph.nodeIds().filter((currentNodeId) => {
      const projection = graph.getNodeAttributes(currentNodeId)?.projection;
      return (
        projection?.derivation?.source ===
        DefaultProjectionDerivationSources.Plugin
      );
    });
    if (logicalProjectionIds.length === 0) {
      return graph;
    }

    const replacementInstances = new Map<NodeId, ProjectionInstance[]>();
    let updated = graph;

    for (const logicalProjectionId of logicalProjectionIds) {
      const logicalNode = graph.getNodeAttributes(logicalProjectionId) as
        | TgNodeAttributes
        | undefined;
      if (!logicalNode?.projection) {
        throw new Error(
          `Rule '${MaterializeProjectionInstances.name}' expected projection node attributes for '${String(logicalProjectionId)}'`,
        );
      }

      const seeds = this.expandLogicalProjection(logicalProjectionId, graph);
      const shouldMaterialize = seeds.some(
        (seed) =>
          seed.instanceKey !== undefined || seed.instanceOrdinal !== undefined,
      );
      if (!shouldMaterialize) {
        continue;
      }

      const instances: ProjectionInstance[] = [];
      for (const seed of seeds) {
        const projectionNodeId = tgProjectionNodeIdFrom(
          logicalNode.projection.layer,
          seed.projectionAddress,
        );
        const anchors = seed.anchors;
        updated = updated.setNodeAttributes(projectionNodeId, {
          projection: {
            layer: logicalNode.projection.layer,
            address: seed.projectionAddress,
            label: seed.projectionLabel,
            derivation: {
              ...logicalNode.projection.derivation,
              source: DefaultProjectionDerivationSources.Profile,
              groupKey: seed.groupKey,
              rootNodeId: seed.rootNodeId,
              rootInstanceAddress: seed.rootInstanceAddress,
              instanceKey: seed.instanceKey,
              instanceOrdinal: seed.instanceOrdinal,
              anchors,
            },
          },
        });

        const projectionInstance: ProjectionInstance = {
          ...seed,
          projectionNodeId,
          layer: logicalNode.projection.layer,
        };
        instances.push(projectionInstance);

        updated = updated.setEdge(
          edgeIdFrom(
            seed.rootNodeId,
            projectionNodeId,
            `projection:${logicalNode.projection.derivation?.projectionName ?? 'materialized'}:realizes`,
          ),
          seed.rootNodeId,
          projectionNodeId,
          {
            projection: {
              layer: logicalNode.projection.layer,
              membership: {
                relation: DefaultProjectionMembershipRelations.Realizes,
                source: 'derived',
              },
            },
          },
        );
      }

      replacementInstances.set(logicalProjectionId, instances);
    }

    if (replacementInstances.size === 0) {
      return graph;
    }

    for (const logicalProjectionId of logicalProjectionIds) {
      for (const edgeId of graph.outEdges(logicalProjectionId)) {
        const sourceId = graph.edgeSource(edgeId);
        const targetId = graph.edgeTarget(edgeId);
        const sourceNode = graph.getNodeAttributes(sourceId);
        const targetNode = graph.getNodeAttributes(targetId);
        if (!sourceNode?.projection || !targetNode?.projection) {
          continue;
        }

        const sourceInstances = this.resolveProjectionInstances(
          sourceId,
          sourceNode,
          replacementInstances,
        );
        const targetInstances = this.resolveProjectionInstances(
          targetId,
          targetNode,
          replacementInstances,
        );

        const shouldReplace =
          replacementInstances.has(sourceId) ||
          replacementInstances.has(targetId);
        if (!shouldReplace) {
          continue;
        }

        const attributes = graph.getEdgeAttributes(edgeId);
        const suffix = this.edgeSuffix(attributes, edgeId);
        for (const pair of this.matchInstances(
          sourceInstances,
          targetInstances,
        )) {
          updated = updated.setEdge(
            edgeIdFrom(
              pair.source.projectionNodeId,
              pair.target.projectionNodeId,
              suffix,
            ),
            pair.source.projectionNodeId,
            pair.target.projectionNodeId,
            {
              ...attributes,
            },
          );
        }
      }
    }

    for (const logicalProjectionId of replacementInstances.keys()) {
      updated = updated.removeNode(logicalProjectionId);
    }

    return updated;
  }

  private expandLogicalProjection(
    logicalProjectionId: NodeId,
    graph: AdapterOperations,
  ): ProjectionInstanceSeed[] {
    const logicalNode = graph.getNodeAttributes(logicalProjectionId) as
      | TgNodeAttributes
      | undefined;
    const projection = logicalNode?.projection;
    if (!projection) {
      return [];
    }

    const anchors = this.rootAnchors(
      projection.derivation,
      logicalProjectionId,
    );
    const seeds = anchors.flatMap((anchor, index) => {
      const rootNode = graph.getNodeAttributes(anchor.nodeId);
      const rootAddress = rootNode?.terraform?.address;
      if (!rootNode || !rootAddress) {
        return [
          buildProjectionInstanceSeed(
            anchor.nodeId,
            projection.address,
            projection.label,
            {
              instanceOrdinal: anchors.length > 1 ? index : undefined,
              anchors: [anchor],
            },
          ),
        ];
      }

      const explicitRootScope = parseTerraformAddressScope(rootAddress);
      const explicitKeyParts = [...explicitRootScope.moduleKeys];
      if (explicitRootScope.terminalKey !== undefined) {
        explicitKeyParts.push(explicitRootScope.terminalKey);
      }
      const explicitRootInstance = {
        key: serializeInstanceKeyParts(explicitKeyParts),
        ordinal: explicitRootScope.terminalOrdinal,
      };
      if (
        explicitRootInstance.key !== undefined ||
        explicitRootInstance.ordinal !== undefined
      ) {
        const explicitOrdinal =
          explicitRootInstance.ordinal ??
          this.stateOrdinal(rootNode, rootAddress) ??
          undefined;
        return [
          buildProjectionInstanceSeed(
            anchor.nodeId,
            projection.address,
            projection.label,
            {
              rootInstanceAddress: rootAddress,
              instanceKey: explicitRootInstance.key,
              instanceOrdinal: explicitOrdinal,
              anchors: [anchor],
            },
          ),
        ];
      }

      const stateInstances = rootNode.terraform?.state?.instances ?? [];
      if (stateInstances.length === 0) {
        return [
          buildProjectionInstanceSeed(
            anchor.nodeId,
            projection.address,
            projection.label,
            {
              rootInstanceAddress: rootAddress,
              anchors: [anchor],
            },
          ),
        ];
      }

      const normalizedInstances = normalizeStateInstanceSeeds(stateInstances);
      return normalizedInstances.map((instance, stateIndex) => {
        const instanceKey = instance.instanceKey;
        const instanceOrdinal =
          instance.instanceOrdinal ??
          (instanceKey === undefined ? undefined : stateIndex);

        return buildProjectionInstanceSeed(
          anchor.nodeId,
          projection.address,
          projection.label,
          {
            rootInstanceAddress: instance.rootInstanceAddress,
            instanceKey,
            instanceOrdinal,
            anchors: [anchor],
          },
        );
      });
    });

    if (
      seeds.length > 1 &&
      seeds.every(
        (seed) =>
          seed.instanceKey === undefined && seed.instanceOrdinal === undefined,
      )
    ) {
      return seeds.map((seed, index) =>
        buildProjectionInstanceSeed(
          seed.rootNodeId,
          seed.groupKey,
          projection.label,
          {
            rootInstanceAddress: seed.rootInstanceAddress,
            instanceOrdinal: index,
            anchors: seed.anchors,
          },
        ),
      );
    }

    return seeds;
  }

  private rootAnchors(
    derivation: TgNodeProjectionDerivation | undefined,
    logicalProjectionId: NodeId,
  ): TgNodeProjectionAnchor[] {
    const anchors = derivation?.anchors?.filter(
      (anchor) =>
        anchor.role === undefined ||
        anchor.role === DefaultProjectionAnchorRoles.RootNode,
    );
    if (anchors && anchors.length > 0) {
      return anchors;
    }

    if (derivation?.rootNodeId) {
      return [
        {
          nodeId: derivation.rootNodeId,
          role: DefaultProjectionAnchorRoles.RootNode,
        },
      ];
    }

    return [
      {
        nodeId: logicalProjectionId,
        role: DefaultProjectionAnchorRoles.RootNode,
      },
    ];
  }

  private resolveProjectionInstances(
    projectionNodeId: NodeId,
    projectionNode: TgNodeAttributes,
    replacements: Map<NodeId, ProjectionInstance[]>,
  ): ProjectionInstance[] {
    const replacement = replacements.get(projectionNodeId);
    if (replacement) {
      return replacement;
    }

    const derivation = projectionNode.projection?.derivation;
    return [
      {
        projectionNodeId,
        projectionAddress:
          projectionNode.projection?.address ?? String(projectionNodeId),
        projectionLabel:
          projectionNode.projection?.label ?? String(projectionNodeId),
        groupKey:
          derivation?.groupKey ??
          projectionNode.projection?.address ??
          String(projectionNodeId),
        rootNodeId: derivation?.rootNodeId ?? projectionNodeId,
        rootInstanceAddress: derivation?.rootInstanceAddress,
        instanceKey: derivation?.instanceKey,
        instanceOrdinal: derivation?.instanceOrdinal,
        isSingleton:
          derivation?.instanceKey === undefined &&
          derivation?.instanceOrdinal === undefined,
        anchors: derivation?.anchors ?? [],
        layer: projectionNode.projection?.layer ?? 'core',
      },
    ];
  }

  private matchInstances(
    sourceInstances: ProjectionInstance[],
    targetInstances: ProjectionInstance[],
  ): ProjectionInstancePair[] {
    if (
      sourceInstances.some((instance) => instance.isSingleton) ||
      targetInstances.some((instance) => instance.isSingleton)
    ) {
      return sourceInstances.flatMap((source) =>
        targetInstances.map((target) => ({ source, target })),
      );
    }

    if (
      sourceInstances.length === targetInstances.length &&
      hasFullKeyCoverage(sourceInstances) &&
      hasFullKeyCoverage(targetInstances) &&
      keysEqual(sourceInstances, targetInstances)
    ) {
      const targetByKey = new Map(
        targetInstances.map((instance) => [
          instance.instanceKey as string,
          instance,
        ]),
      );
      return sourceInstances.map((source) => ({
        source,
        target: targetByKey.get(
          source.instanceKey as string,
        ) as ProjectionInstance,
      }));
    }

    const keyIntersection = sourceInstances.filter((source) =>
      targetInstances.some(
        (target) => target.instanceKey === source.instanceKey,
      ),
    );
    if (keyIntersection.length > 0) {
      return [];
    }

    if (
      sourceInstances.length === targetInstances.length &&
      hasFullOrdinalCoverage(sourceInstances) &&
      hasFullOrdinalCoverage(targetInstances)
    ) {
      const sortedSource = [...sourceInstances].sort(
        (left, right) =>
          (left.instanceOrdinal as number) - (right.instanceOrdinal as number),
      );
      const sortedTarget = [...targetInstances].sort(
        (left, right) =>
          (left.instanceOrdinal as number) - (right.instanceOrdinal as number),
      );
      return sortedSource.map((source, index) => ({
        source,
        target: sortedTarget[index] as ProjectionInstance,
      }));
    }

    return [];
  }

  private edgeSuffix(attributes: TgEdgeAttributes, edgeId: string): string {
    if (attributes.projection?.membership?.relation) {
      return `projection:${attributes.projection.layer}:${attributes.projection.membership.relation}`;
    }
    if (attributes.projection?.adjacency) {
      return `projection:${attributes.projection.layer}:adjacency`;
    }

    const parts = String(edgeId).split(':');
    return parts[parts.length - 1] as string;
  }

  private static parseOptions(
    input: unknown,
  ): MaterializeProjectionInstancesOptions {
    if (!isObjectRecord(input)) {
      return {
        instanceStrategy: ProjectionInstanceStrategies.None,
      };
    }

    return {
      instanceStrategy: isProjectionInstanceStrategyName(input.instanceStrategy)
        ? input.instanceStrategy
        : ProjectionInstanceStrategies.None,
    };
  }

  private stateOrdinal(
    node: TgNodeAttributes,
    address: string,
  ): number | undefined {
    const instances = node.terraform?.state?.instances;
    if (!instances) {
      return undefined;
    }

    const explicitIndex = instances.findIndex(
      (instance) => instance.address === address,
    );
    return explicitIndex >= 0 ? explicitIndex : undefined;
  }
}

NodeRule.register(MaterializeProjectionInstances);
