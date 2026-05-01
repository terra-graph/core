import { Graph as GraphLibGraph } from 'graphlib';
import dot from 'graphlib-dot';
import { DotAdapter } from '../Adapters/DotAdapter.js';
import { RenderArtifact, Renderer } from '../Renderer.js';
import {
  DefaultEdgeSemanticRoles,
  TgEdge,
  TgGraph,
  TgNode,
  type TgTopologyScope,
} from '../TgGraph.js';
import { TgNodeLabel } from './TgNodeLabel.js';

type DotGraphAttributes = {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  ranksep?: number;
  nodesep?: number;
  pad?: number;
  newrank?: boolean;
} & Record<string, string | number | boolean | undefined>;

export type DotRendererOptions = {
  graph?: DotGraphAttributes;
  layout?: DotLayoutOptions;
};

type DotLegendEntry = {
  title: string;
  colour: string;
};

type SymmetricLaneGroup = {
  groupId: string;
  lanes: TgTopologyScope[];
  slots: string[];
  slotScopesByLaneId: Map<string, Map<string, TgTopologyScope>>;
};

type SymmetricContentGroup = {
  groupId: string;
  scopes: TgTopologyScope[];
  slots: string[];
  nodeIdsByScopeIdAndSlotKey: Map<string, Map<string, string[]>>;
};

type DotLayoutOptions = {
  cardinalityLabel?: 'off' | 'suffix';
};

const defaultGraphOptions: DotRendererOptions = {
  graph: {
    rankdir: 'TB',
    ranksep: 2.5,
    nodesep: 0.6,
    pad: 1,
  },
};

const defaultLayoutOptions: Required<DotLayoutOptions> = {
  cardinalityLabel: 'off',
};

export class DotRenderer implements Renderer<DotAdapter> {
  private readonly options: DotRendererOptions;

  constructor(options: DotRendererOptions = {}) {
    this.options = {
      graph: DotRenderer.resolveGraphOptions(options.graph),
      layout: DotRenderer.resolveLayoutOptions(options.layout),
    };
  }

  public render(adapter: DotAdapter): RenderArtifact {
    const tg = adapter.toTgGraph();
    const topologyScopes = this.resolveTopologyScopes(tg);
    const symmetricLaneGroups = this.resolveSymmetricLaneGroups(topologyScopes);
    const symmetricContentGroups = this.resolveSymmetricContentGroups(
      tg,
      topologyScopes,
    );
    const graph = new GraphLibGraph({
      directed: true,
      multigraph: true,
      compound: true,
    });

    /* istanbul ignore next */
    graph.setGraph(
      this.resolveRuntimeGraphOptions(
        symmetricLaneGroups.length > 0 || symmetricContentGroups.length > 0,
      ),
    );

    this.addNodes(
      graph,
      tg,
      topologyScopes,
      symmetricLaneGroups,
      symmetricContentGroups,
    );
    this.addEdges(graph, tg);
    this.addLayoutFlowOrderingEdges(graph, tg);

    let output = dot.write(graph);
    output = this.applyLegend(output, tg);
    output = this.applyRanks(output, adapter);
    output = this.applySymmetricTopologyRanks(output, symmetricLaneGroups);
    output = this.applySymmetricContentRanks(output, symmetricContentGroups);
    output = this.normalizeQuotedHtmlLabels(output);
    return {
      content: output,
      mediaType: 'text/vnd.graphviz',
      extension: 'dot',
    };
  }

  private addNodes(
    graph: GraphLibGraph,
    tg: TgGraph,
    scopes: TgTopologyScope[],
    symmetricLaneGroups: SymmetricLaneGroup[],
    symmetricContentGroups: SymmetricContentGroup[],
  ) {
    this.addTopologyScopeNodes(graph, scopes);
    this.addTopologyScopeParents(graph, scopes);
    this.addSymmetricLanePlaceholders(graph, symmetricLaneGroups);
    const topologyScopeIds = new Set(scopes.map((scope) => scope.id));

    for (const node of Object.values(tg.nodes)) {
      graph.setNode(node.id, this.toDotNodeAttributes(node));
      const scopeId = node.hints?.topology?.scopeId;
      if (scopeId && topologyScopeIds.has(scopeId)) {
        graph.setParent(node.id, this.toTopologyScopeNodeId(scopeId));
      }
    }

    this.addSymmetricContentSlotAnchors(graph, symmetricContentGroups);
  }

  private addEdges(graph: GraphLibGraph, tg: TgGraph) {
    for (const edge of tg.edges) {
      graph.setEdge(
        { v: edge.from, w: edge.to, name: edge.id as unknown as string },
        this.toDotEdgeAttributes(edge),
      );
    }
  }

  private addLayoutFlowOrderingEdges(graph: GraphLibGraph, tg: TgGraph) {
    const nodesByScopeId = new Map<string, TgNode[]>();

    for (const node of Object.values(tg.nodes)) {
      if (typeof node.hints?.layout?.flowOrder !== 'number') {
        continue;
      }

      const scopeId = node.hints?.topology?.scopeId ?? '__root__';
      const scopedNodes = nodesByScopeId.get(scopeId) ?? [];
      scopedNodes.push(node);
      nodesByScopeId.set(scopeId, scopedNodes);
    }

    for (const [scopeId, scopedNodes] of nodesByScopeId.entries()) {
      const orderedNodes = [...scopedNodes].sort((left, right) =>
        this.compareNodesByLayoutFlowOrderThenId(left, right),
      );

      for (let index = 1; index < orderedNodes.length; index += 1) {
        const previous = orderedNodes[index - 1];
        const current = orderedNodes[index];
        /* istanbul ignore next -- index bounds guarantee values when iterating */
        if (!previous || !current) {
          continue;
        }

        graph.setEdge(
          {
            v: previous.id as unknown as string,
            w: current.id as unknown as string,
            name: `tg.layout.flow-order:${scopeId}:${index}`,
          },
          {
            style: 'invis',
            weight: 120,
          },
        );
      }
    }
  }

  private collectLegendEdges(tg: TgGraph): TgEdge[] {
    return tg.edges.filter((edge) => edge.attributes?.legend !== undefined);
  }

  private collectLegendEntries(tg: TgGraph): DotLegendEntry[] {
    const entries = this.collectLegendEdges(tg)
      .map((edge) => edge.attributes?.legend)
      .filter((legend): legend is DotLegendEntry => legend !== undefined);

    const unique = new Map<string, DotLegendEntry>();
    for (const entry of entries) {
      unique.set(`${entry.title}:${entry.colour}`, entry);
    }

    return [...unique.values()];
  }

  private toDotNodeAttributes(node: TgNode): Record<string, unknown> {
    const attributes: Record<string, unknown> = {
      // initial label is set, may be overriden by adapter specific implementations
      label: this.buildDefaultNodeLabel(node),
      ...(node.adapter?.[DotAdapter.name] ?? {}),
    };

    return this.applyCardinalitySuffix(attributes, node);
  }

  private toDotEdgeAttributes(edge: TgEdge): Record<string, unknown> {
    const semanticRole = edge.attributes?.hints?.semantic?.role;
    const semanticDotAttributes =
      semanticRole === DefaultEdgeSemanticRoles.Supporting
        ? { constraint: false, weight: 1 }
        : {};
    const dotAdapterAttributes =
      edge.attributes?.adapter?.[DotAdapter.name] ?? {};

    if (edge.attributes?.legend) {
      return {
        ...semanticDotAttributes,
        ...dotAdapterAttributes,
        color: edge.attributes.legend.colour,
      };
    }

    return {
      ...semanticDotAttributes,
      ...dotAdapterAttributes,
    };
  }

  private applyRanks(output: string, adapter: DotAdapter): string {
    const ranks = adapter.getRanks();
    if (ranks.length === 0) {
      return output;
    }

    const existingNodeIds = new Set(adapter.nodeIds());
    const filteredRanks = ranks
      .map((rank) => ({
        ...rank,
        nodes: rank.nodes.filter((nodeId) => existingNodeIds.has(nodeId)),
      }))
      .filter((rank) => rank.nodes.length > 1);

    if (filteredRanks.length === 0) {
      return output;
    }

    const rankBlock = filteredRanks
      .map((rank) => {
        const nodes = rank.nodes
          .map((nodeId) => this.quoteDotId(nodeId))
          .join(' ');
        return `  { rank = ${rank.mode}; ${nodes} }`;
      })
      .join('\n');

    const lastBrace = output.lastIndexOf('}');
    if (lastBrace === -1) {
      return output;
    }

    return `${output.slice(0, lastBrace)}\n${rankBlock}\n}`;
  }

  private applyLegend(output: string, tg: TgGraph): string {
    const legends = this.collectLegendEntries(tg);
    const hasDescription = Object.keys(tg.description).length > 0;

    if (legends.length === 0 && !hasDescription) {
      return output;
    }

    const clusterName = 'Legend';
    const descriptionRows = Object.entries(tg.description)
      .map(([key, value]) => {
        return `<tr><td align="left"><font point-size="10" color="#999999">${key}:</font></td><td align="left"><font point-size="10" color="#000000">&nbsp;&nbsp;&nbsp;${String(
          value,
        )}</font></td></tr>`;
      })
      .join('');

    const descriptionNode = hasDescription
      ? `    "${clusterName}_description" [shape="plaintext" fontname="sans-serif" label=<<table align="left" border="0" cellpadding="2" cellspacing="0" cellborder="0">${descriptionRows}</table>>];`
      : '';

    const legendRows = legends
      .map((legend, index) => {
        const descriptionLink = hasDescription
          ? `\n    "${clusterName}_description" -> "${clusterName}.A${index}" [style="invis"];`
          : '';

        return [
          `    "${clusterName}.A${index}" [label="" style="invis" height=0 width=0];`,
          `    "${clusterName}.B${index}" [label="" style="invis" height=0 width=0];`,
          `    "${clusterName}.A${index}" -> "${clusterName}.B${index}" [label="${legend.title}" fontname="sans-serif" fontsize="10" color="${legend.colour}"];${descriptionLink}`,
        ].join('\n');
      })
      .join('\n');

    const keySubgraph = `  subgraph "cluster_${clusterName}" {
    label = "${clusterName}"
    color = "#DDDDDD"
    fontname = "sans-serif"
    penwidth = 0.75
    fontcolor = "#999999"
    fontsize = 10
${descriptionNode}
${legendRows}
  }
  subgraph cluster_padKey {
    style = "invis"
    "S1" [style="invis"];
    "S2" [style="invis"];
    "S3" [style="invis"];
    "S4" [style="invis"];
    "S1" -> "S2" [style="invis"];
    "S2" -> "S3" [style="invis"];
    "S3" -> "S4" [style="invis"];
  }`;

    const firstBrace = output.indexOf('{');
    if (firstBrace === -1) {
      return output;
    }

    const merged =
      `${output.slice(0, firstBrace + 1)}\n${keySubgraph}\n${output.slice(
        firstBrace + 1,
      )}`
        .replace(/"\s*<</g, '<<')
        .replace(/>>\s*"/g, '>>');

    return this.unescapeHtmlLabelQuotes(merged);
  }

  private buildDefaultNodeLabel(node: TgNode): string {
    return new TgNodeLabel(node).getLabel();
  }

  private buildNodeLabel(node: TgNode): string {
    return this.buildDefaultNodeLabel(node);
  }

  private applyCardinalitySuffix(
    attributes: Record<string, unknown>,
    node: TgNode,
  ): Record<string, unknown> {
    if (this.options.layout?.cardinalityLabel !== 'suffix') {
      return attributes;
    }

    const count = node.hints?.cardinality?.count;
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 1) {
      return attributes;
    }

    const label = attributes.label;
    if (typeof label !== 'string') {
      return attributes;
    }

    if (label.trimStart().startsWith('<<')) {
      return attributes;
    }

    return {
      ...attributes,
      label: `${label} x${count}`,
    };
  }

  private resolveTopologyScopes(tg: TgGraph): TgTopologyScope[] {
    const scopes = new Map<string, TgTopologyScope>();

    for (const scope of Object.values(tg.hints?.topology?.scopes ?? {})) {
      if (this.isTopologyScope(scope)) {
        scopes.set(scope.id, scope);
      }
    }

    return [...scopes.values()].sort((left, right) => {
      const leftOrder =
        typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder =
        typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.id.localeCompare(right.id);
    });
  }

  private addTopologyScopeNodes(
    graph: GraphLibGraph,
    scopes: TgTopologyScope[],
  ) {
    for (const scope of scopes) {
      const scopeNodeId = this.toTopologyScopeNodeId(scope.id);
      graph.setNode(scopeNodeId, this.toDotScopeAttributes(scope));

      // Non-root scopes need an anchor so nested cluster layout constraints have
      // a stable target node to pull against.
      if (!scope.parentId) {
        continue;
      }

      const anchorNodeId = this.toTopologyScopeAnchorNodeId(scope.id);
      graph.setNode(anchorNodeId, {
        label: '',
        style: 'invis',
        width: 0,
        height: 0,
        fixedsize: true,
      });
      graph.setParent(anchorNodeId, scopeNodeId);
    }
  }

  private addTopologyScopeParents(
    graph: GraphLibGraph,
    scopes: TgTopologyScope[],
  ) {
    const scopesById = new Map(scopes.map((scope) => [scope.id, scope]));

    for (const scope of scopes) {
      const parentId = this.resolveScopeParentId(scope.id, scopesById);
      if (!parentId) {
        continue;
      }

      graph.setParent(
        this.toTopologyScopeNodeId(scope.id),
        this.toTopologyScopeNodeId(parentId),
      );
    }
  }

  private addSymmetricLanePlaceholders(
    graph: GraphLibGraph,
    groups: SymmetricLaneGroup[],
  ) {
    for (const group of groups) {
      const slotAnchorIdsByLaneId = new Map<string, Map<string, string>>();

      for (const lane of group.lanes) {
        const laneSlotScopes =
          group.slotScopesByLaneId.get(lane.id) ?? new Map();
        const slotAnchorIds = group.slots.map((slotKey) => {
          const scope = laneSlotScopes.get(slotKey);
          if (scope) {
            return this.toTopologyScopeAnchorNodeId(scope.id);
          }

          const placeholderNodeId = this.toTopologyScopePlaceholderNodeId(
            lane.id,
            slotKey,
          );
          graph.setNode(placeholderNodeId, {
            label: '',
            style: 'invis',
            width: 0,
            height: 0,
            fixedsize: true,
          });
          graph.setParent(
            placeholderNodeId,
            this.toTopologyScopeNodeId(lane.id),
          );
          return placeholderNodeId;
        });
        slotAnchorIdsByLaneId.set(
          lane.id,
          new Map(
            group.slots.map((slotKey, index) => [
              slotKey,
              slotAnchorIds[index] as string,
            ]),
          ),
        );

        for (let index = 1; index < slotAnchorIds.length; index += 1) {
          graph.setEdge(
            {
              v: slotAnchorIds[index - 1] as unknown as string,
              w: slotAnchorIds[index] as unknown as string,
              name: `tg.layout.slot-order:${group.groupId}:${lane.id}:${index}`,
            },
            {
              style: 'invis',
              weight: 100,
            },
          );
        }

        /* istanbul ignore next -- groups are filtered to contain at least one slot */
        if (slotAnchorIds.length > 0) {
          graph.setEdge(
            {
              v: this.toTopologyScopeAnchorNodeId(lane.id),
              w: slotAnchorIds[0] as unknown as string,
              name: `tg.layout.scope-slot-anchor:${group.groupId}:${lane.id}`,
            },
            {
              style: 'invis',
              weight: 110,
              minlen: 0,
            },
          );
        }
      }
    }
  }

  private resolveScopeParentId(
    scopeId: string,
    scopesById: Map<string, TgTopologyScope>,
  ): string | undefined {
    const parentId = scopesById.get(scopeId)?.parentId;
    if (!parentId || !scopesById.has(parentId)) {
      return undefined;
    }

    if (this.scopeParentCreatesCycle(scopeId, parentId, scopesById)) {
      return undefined;
    }

    return parentId;
  }

  private scopeParentCreatesCycle(
    scopeId: string,
    parentId: string,
    scopesById: Map<string, TgTopologyScope>,
  ): boolean {
    const visited = new Set<string>([scopeId]);
    let current: string | undefined = parentId;

    while (current) {
      if (visited.has(current)) {
        return true;
      }
      visited.add(current);

      const next: string | undefined = scopesById.get(current)?.parentId;
      if (!next || !scopesById.has(next)) {
        return false;
      }
      current = next;
    }

    return false;
  }

  private applySymmetricTopologyRanks(
    output: string,
    groups: SymmetricLaneGroup[],
  ): string {
    const rankBlocks = groups
      .flatMap((group) =>
        group.slots.map((slotKey) => {
          const nodes = group.lanes.map((lane) => {
            const scope = group.slotScopesByLaneId.get(lane.id)?.get(slotKey);
            return scope
              ? this.toTopologyScopeAnchorNodeId(scope.id)
              : this.toTopologyScopePlaceholderNodeId(lane.id, slotKey);
          });

          if (nodes.length < 2) {
            return undefined;
          }

          return `  { rank = same; ${nodes
            .map((nodeId) => this.quoteDotId(nodeId))
            .join(' ')} }`;
        }),
      )
      .filter((block): block is string => !!block);

    if (rankBlocks.length === 0) {
      return output;
    }

    const lastBrace = output.lastIndexOf('}');
    /* istanbul ignore if -- defensive fallback for malformed dot output */
    if (lastBrace === -1) {
      return output;
    }

    return `${output.slice(0, lastBrace)}\n${rankBlocks.join('\n')}\n}`;
  }

  private addSymmetricContentSlotAnchors(
    graph: GraphLibGraph,
    groups: SymmetricContentGroup[],
  ) {
    for (const group of groups) {
      for (const scope of group.scopes) {
        const slotNodes = group.nodeIdsByScopeIdAndSlotKey.get(scope.id);
        const contentAnchorIds = group.slots.map((slotKey) => {
          const anchorNodeId = this.toTopologyContentSlotAnchorNodeId(
            scope.id,
            slotKey,
          );
          graph.setNode(anchorNodeId, {
            label: '',
            style: 'invis',
            width: 0,
            height: 0,
            fixedsize: true,
          });
          graph.setParent(anchorNodeId, this.toTopologyScopeNodeId(scope.id));

          const nodeIds = slotNodes?.get(slotKey) ?? [];
          for (const nodeId of nodeIds) {
            graph.setEdge(
              {
                v: anchorNodeId,
                w: nodeId as unknown as string,
                name: `tg.layout.content-slot-node:${group.groupId}:${scope.id}:${slotKey}:${nodeId}`,
              },
              {
                style: 'invis',
                weight: 90,
              },
            );
          }

          return anchorNodeId;
        });

        /* istanbul ignore next -- content anchors are only added for nested scoped groups with slots */
        if (scope.parentId && contentAnchorIds.length > 0) {
          graph.setEdge(
            {
              v: this.toTopologyScopeAnchorNodeId(scope.id),
              w: contentAnchorIds[0] as unknown as string,
              name: `tg.layout.scope-content-anchor:${group.groupId}:${scope.id}`,
            },
            {
              style: 'invis',
              weight: 110,
              minlen: 0,
            },
          );
        }

        for (let index = 1; index < contentAnchorIds.length; index += 1) {
          graph.setEdge(
            {
              v: contentAnchorIds[index - 1] as unknown as string,
              w: contentAnchorIds[index] as unknown as string,
              name: `tg.layout.content-slot-order:${group.groupId}:${scope.id}:${index}`,
            },
            {
              style: 'invis',
              weight: 100,
            },
          );
        }
      }
    }
  }

  private applySymmetricContentRanks(
    output: string,
    groups: SymmetricContentGroup[],
  ): string {
    const rankBlocks = groups
      .flatMap((group) => {
        const blocks: string[] = [];

        for (const scope of group.scopes) {
          for (const slotKey of group.slots) {
            const nodeIds =
              group.nodeIdsByScopeIdAndSlotKey.get(scope.id)?.get(slotKey) ??
              [];
            if (nodeIds.length === 0) {
              continue;
            }

            blocks.push(
              `  { rank = same; ${[
                this.toTopologyContentSlotAnchorNodeId(scope.id, slotKey),
                ...nodeIds,
              ]
                .map((nodeId) => this.quoteDotId(nodeId))
                .join(' ')} }`,
            );
          }
        }

        return blocks;
      })
      .filter((block): block is string => !!block);

    if (rankBlocks.length === 0) {
      return output;
    }

    const lastBrace = output.lastIndexOf('}');
    if (lastBrace === -1) {
      return output;
    }

    return `${output.slice(0, lastBrace)}\n${rankBlocks.join('\n')}\n}`;
  }

  private resolveSymmetricLaneGroups(
    scopes: TgTopologyScope[],
  ): SymmetricLaneGroup[] {
    const scopesById = new Map(scopes.map((scope) => [scope.id, scope]));
    const lanesByGroupId = new Map<string, TgTopologyScope[]>();

    for (const scope of scopes) {
      const layout = scope.layout;
      if (layout?.mode !== 'symmetric' || !layout.groupId || !layout.laneKey) {
        continue;
      }

      const group = lanesByGroupId.get(layout.groupId) ?? [];
      group.push(scope);
      lanesByGroupId.set(layout.groupId, group);
    }

    return [...lanesByGroupId.entries()]
      .map(([groupId, lanes]) => {
        const sortedLanes = [...lanes].sort((left, right) =>
          this.compareScopesByOrderThenId(left, right),
        );
        const laneIds = new Set(sortedLanes.map((lane) => lane.id));
        const slotScopesByLaneId = new Map<
          string,
          Map<string, TgTopologyScope>
        >();
        const slotOrderByKey = new Map<string, number>();

        for (const scope of scopesById.values()) {
          if (!scope.parentId || !laneIds.has(scope.parentId)) {
            continue;
          }

          const slotKey = scope.layout?.slotKey;
          if (!slotKey) {
            continue;
          }

          const slotScopes =
            slotScopesByLaneId.get(scope.parentId) ?? new Map();
          const existingSlotScope = slotScopes.get(slotKey);
          if (
            !existingSlotScope ||
            this.compareScopesByOrderThenId(scope, existingSlotScope) < 0
          ) {
            slotScopes.set(slotKey, scope);
          }
          slotScopesByLaneId.set(scope.parentId, slotScopes);

          const scopeOrder =
            typeof scope.order === 'number'
              ? scope.order
              : Number.MAX_SAFE_INTEGER;
          const existingOrder =
            slotOrderByKey.get(slotKey) ?? Number.MAX_SAFE_INTEGER;
          slotOrderByKey.set(slotKey, Math.min(existingOrder, scopeOrder));
        }

        const slots = [...slotOrderByKey.entries()]
          .sort((left, right) => {
            if (left[1] !== right[1]) {
              return left[1] - right[1];
            }
            return left[0].localeCompare(right[0]);
          })
          .map(([slotKey]) => slotKey);

        return {
          groupId,
          lanes: sortedLanes,
          slots,
          slotScopesByLaneId,
        };
      })
      .filter((group) => group.lanes.length > 1 && group.slots.length > 0)
      .sort((left, right) => {
        const leftLane = left.lanes[0];
        const rightLane = right.lanes[0];
        /* istanbul ignore next -- groups are filtered to contain multiple lanes */
        if (leftLane && rightLane) {
          const orderCompare = this.compareScopesByOrderThenId(
            leftLane,
            rightLane,
          );
          if (orderCompare !== 0) {
            return orderCompare;
          }
        }
        return left.groupId.localeCompare(right.groupId);
      });
  }

  private resolveSymmetricContentGroups(
    tg: TgGraph,
    scopes: TgTopologyScope[],
  ): SymmetricContentGroup[] {
    const nodesByScopeId = new Map<string, TgNode[]>();
    for (const node of Object.values(tg.nodes)) {
      const scopeId = node.hints?.topology?.scopeId;
      const slotKey = node.hints?.topology?.slotKey;
      if (!scopeId || !slotKey) {
        continue;
      }

      const scopedNodes = nodesByScopeId.get(scopeId) ?? [];
      scopedNodes.push(node);
      nodesByScopeId.set(scopeId, scopedNodes);
    }

    return this.resolveSymmetricLaneGroups(scopes)
      .flatMap((laneGroup) =>
        laneGroup.slots.map((scopeSlotKey) => {
          const alignedScopes = laneGroup.lanes
            .map((lane) =>
              laneGroup.slotScopesByLaneId.get(lane.id)?.get(scopeSlotKey),
            )
            .filter((scope): scope is TgTopologyScope => !!scope)
            .sort((left, right) =>
              this.compareScopesByOrderThenId(left, right),
            );

          if (alignedScopes.length < 2) {
            return undefined;
          }

          const nodeIdsByScopeIdAndSlotKey = new Map<
            string,
            Map<string, string[]>
          >();
          const slotOrderByKey = new Map<string, number>();

          for (const scope of alignedScopes) {
            const scopedNodes = [...(nodesByScopeId.get(scope.id) ?? [])].sort(
              (left, right) =>
                this.compareNodesByTopologyOrderThenId(left, right),
            );
            const slotNodes = new Map<string, string[]>();

            for (const node of scopedNodes) {
              const slotKey = node.hints?.topology?.slotKey;
              /* istanbul ignore next -- scopedNodes are pre-filtered to include slot keys */
              if (!slotKey) {
                continue;
              }

              const nodeIds = slotNodes.get(slotKey) ?? [];
              nodeIds.push(node.id);
              slotNodes.set(slotKey, nodeIds);

              const slotOrder =
                typeof node.hints?.topology?.slotOrder === 'number'
                  ? node.hints.topology.slotOrder
                  : Number.MAX_SAFE_INTEGER;
              const existingOrder =
                slotOrderByKey.get(slotKey) ?? Number.MAX_SAFE_INTEGER;
              slotOrderByKey.set(slotKey, Math.min(existingOrder, slotOrder));
            }

            if (slotNodes.size > 0) {
              nodeIdsByScopeIdAndSlotKey.set(scope.id, slotNodes);
            }
          }

          const slots = [...slotOrderByKey.entries()]
            .sort((left, right) => {
              if (left[1] !== right[1]) {
                return left[1] - right[1];
              }
              return left[0].localeCompare(right[0]);
            })
            .map(([slotKey]) => slotKey);

          if (slots.length === 0) {
            return undefined;
          }

          return {
            groupId: `${laneGroup.groupId}:content:${scopeSlotKey}`,
            scopes: alignedScopes,
            slots,
            nodeIdsByScopeIdAndSlotKey,
          };
        }),
      )
      .filter((group): group is SymmetricContentGroup => !!group);
  }

  private compareScopesByOrderThenId(
    left: TgTopologyScope,
    right: TgTopologyScope,
  ): number {
    const leftOrder =
      typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder =
      typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.id.localeCompare(right.id);
  }

  private compareNodesByTopologyOrderThenId(
    left: TgNode,
    right: TgNode,
  ): number {
    const leftOrder =
      typeof left.hints?.topology?.order === 'number'
        ? left.hints.topology.order
        : Number.MAX_SAFE_INTEGER;
    const rightOrder =
      typeof right.hints?.topology?.order === 'number'
        ? right.hints.topology.order
        : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left.id).localeCompare(String(right.id));
  }

  private compareNodesByLayoutFlowOrderThenId(
    left: TgNode,
    right: TgNode,
  ): number {
    const leftOrder =
      typeof left.hints?.layout?.flowOrder === 'number'
        ? left.hints.layout.flowOrder
        : Number.MAX_SAFE_INTEGER;
    const rightOrder =
      typeof right.hints?.layout?.flowOrder === 'number'
        ? right.hints.layout.flowOrder
        : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left.id).localeCompare(String(right.id));
  }

  private toDotScopeAttributes(
    scope: TgTopologyScope,
  ): Record<string, unknown> {
    return {
      label: scope.label ?? scope.id,
      ...(scope.adapter?.[DotAdapter.name] ?? {}),
    };
  }

  private toTopologyScopeNodeId(scopeId: string): string {
    return `cluster_scope_${scopeId}`;
  }

  private toTopologyScopeAnchorNodeId(scopeId: string): string {
    return `${this.toTopologyScopeNodeId(scopeId)}__anchor`;
  }

  private toTopologyScopePlaceholderNodeId(
    laneScopeId: string,
    slotKey: string,
  ): string {
    return `${this.toTopologyScopeNodeId(laneScopeId)}__slot__${slotKey}`;
  }

  private toTopologyContentSlotAnchorNodeId(
    scopeId: string,
    slotKey: string,
  ): string {
    return `${this.toTopologyScopeNodeId(scopeId)}__content_slot__${slotKey}`;
  }

  private isTopologyScope(value: unknown): value is TgTopologyScope {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      'id' in value &&
      typeof (value as { id?: unknown }).id === 'string' &&
      (value as { id: string }).id.length > 0
    );
  }

  private quoteDotId(nodeId: string): string {
    const escaped = nodeId.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    return `"${escaped}"`;
  }

  private normalizeQuotedHtmlLabels(output: string): string {
    const normalized = output.replace(/"\s*<</g, '<<').replace(/>>\s*"/g, '>>');

    return this.unescapeHtmlLabelQuotes(normalized);
  }

  private unescapeHtmlLabelQuotes(output: string): string {
    return output.replace(/<<[\s\S]*?>>/g, (label) =>
      label.replace(/\\+"/g, '"'),
    );
  }

  private static resolveGraphOptions(
    input?: DotGraphAttributes,
  ): DotGraphAttributes {
    /* istanbul ignore next */
    const graphOptions: DotGraphAttributes = {
      ...(defaultGraphOptions.graph ?? {}),
      ...(input ?? {}),
    };

    if (graphOptions.rankdir === 'TB' || graphOptions.rankdir === 'BT') {
      return {
        ...graphOptions,
        nodesep: input?.nodesep ?? 2.5,
        ranksep: input?.ranksep ?? 0.6,
      };
    }

    return graphOptions;
  }

  private static resolveLayoutOptions(
    input?: DotLayoutOptions,
  ): Required<DotLayoutOptions> {
    return {
      ...defaultLayoutOptions,
      ...(input ?? {}),
    };
  }

  /* istanbul ignore next -- exercised via render output, but branch attribution is unstable */
  private resolveRuntimeGraphOptions(
    hasGlobalRankConstraints: boolean,
  ): DotGraphAttributes {
    if (
      this.options.graph?.newrank !== undefined ||
      !hasGlobalRankConstraints
    ) {
      return this.options.graph ?? {};
    }

    return {
      ...(this.options.graph ?? {}),
      newrank: true,
    };
  }
}
