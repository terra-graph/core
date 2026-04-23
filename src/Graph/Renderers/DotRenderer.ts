import { Graph as GraphLibGraph } from 'graphlib';
import dot from 'graphlib-dot';
import { DotAdapter } from '../Adapters/DotAdapter.js';
import { RenderArtifact, Renderer } from '../Renderer.js';
import { TgEdge, TgGraph, TgNode, type TgTopologyScope } from '../TgGraph.js';
import { TgNodeLabel } from './TgNodeLabel.js';

type DotGraphAttributes = {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  ranksep?: number;
  nodesep?: number;
  pad?: number;
} & Record<string, string | number | boolean | undefined>;

export type DotRendererOptions = {
  graph?: DotGraphAttributes;
  layout?: DotLayoutOptions;
};

type DotLegendEntry = {
  title: string;
  colour: string;
};

type DotLayoutOptions = {
  cardinalityLabel?: 'off' | 'suffix';
};

const defaultGraphOptions: DotRendererOptions = {
  graph: {
    rankdir: 'LR',
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
    const graph = new GraphLibGraph({
      directed: true,
      multigraph: true,
      compound: true,
    });

    /* istanbul ignore next */
    graph.setGraph(this.options.graph ?? {});

    this.addNodes(graph, tg);
    this.addEdges(graph, tg);

    let output = dot.write(graph);
    output = this.applyLegend(output, tg);
    output = this.applyRanks(output, adapter);
    output = this.normalizeQuotedHtmlLabels(output);
    return {
      content: output,
      mediaType: 'text/vnd.graphviz',
      extension: 'dot',
    };
  }

  private addNodes(graph: GraphLibGraph, tg: TgGraph) {
    const scopes = this.resolveTopologyScopes(tg);
    this.addTopologyScopeNodes(graph, scopes);
    this.addTopologyScopeParents(graph, scopes);
    const topologyScopeIds = new Set(scopes.map((scope) => scope.id));

    for (const node of Object.values(tg.nodes)) {
      graph.setNode(node.id, this.toDotNodeAttributes(node));
      const scopeId = node.hints?.topology?.scopeId;
      if (scopeId && topologyScopeIds.has(scopeId)) {
        graph.setParent(node.id, this.toTopologyScopeNodeId(scopeId));
      }
    }
  }

  private addEdges(graph: GraphLibGraph, tg: TgGraph) {
    for (const edge of tg.edges) {
      graph.setEdge(
        { v: edge.from, w: edge.to, name: edge.id as unknown as string },
        this.toDotEdgeAttributes(edge),
      );
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
      label: this.buildNodeLabel(node),
      ...(node.adapter?.[DotAdapter.name] ?? {}),
    };

    return this.applyCardinalitySuffix(attributes, node);
  }

  private toDotEdgeAttributes(edge: TgEdge): Record<string, unknown> {
    const dotAdapterAttributes =
      edge.attributes?.adapter?.[DotAdapter.name] ?? {};

    if (edge.attributes?.legend) {
      return {
        ...dotAdapterAttributes,
        color: edge.attributes.legend.colour,
      };
    }

    return {
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

  private buildNodeLabel(node: TgNode): string {
    return new TgNodeLabel(node).getLabel();
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
      graph.setNode(
        this.toTopologyScopeNodeId(scope.id),
        this.toDotScopeAttributes(scope),
      );
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
}
