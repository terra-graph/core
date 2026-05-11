import z from 'zod';
import {
  NodeId,
  TgEdgeAttributes,
  TgNodeAttributes,
} from '../../../TgGraph.js';
import { Operations } from '../../Operations.js';
import { NodeQuery } from '../NodeQuery/NodeQuery.js';
import {
  AttrPredicate,
  AttrPredicateSchema,
} from '../NodeQuery/QuerySchema.js';
import { EdgeQueryDsl, EdgeQuerySchema } from './QuerySchema.js';

type EdgeMatchFn = (
  sourceId: NodeId,
  source: TgNodeAttributes,
  targetId: NodeId,
  target: TgNodeAttributes,
  edge: TgEdgeAttributes,
  graph: Operations,
) => boolean;

type SourceNodeMatchFn = (
  nodeId: NodeId,
  node: TgNodeAttributes,
  graph: Operations,
) => boolean;

type SourceNodeConstraint =
  | { kind: 'known'; fn: SourceNodeMatchFn }
  | { kind: 'unknown' };

export class EdgeQuery {
  public static readonly schema = EdgeQuerySchema;
  public readonly from: NodeQuery;
  public readonly to: NodeQuery;

  public static from(input: z.infer<typeof EdgeQuerySchema>): EdgeQuery {
    return new EdgeQuery(EdgeQuery.schema.parse(input));
  }

  public static fromJson(input: unknown): EdgeQuery {
    return new EdgeQuery(EdgeQuery.schema.parse(input));
  }

  constructor(private readonly dsl: EdgeQueryDsl) {
    const fromDsl =
      'from' in dsl && dsl.from !== undefined
        ? dsl.from
        : ({ any: true } as const);
    const toDsl =
      'to' in dsl && dsl.to !== undefined ? dsl.to : ({ any: true } as const);
    this.from = NodeQuery.from(fromDsl);
    this.to = NodeQuery.from(toDsl);
  }

  public matchSourceNode(
    nodeId: NodeId,
    node: TgNodeAttributes,
    graph: Operations,
  ): boolean {
    const constraint = EdgeQuery.compileSourceNodeConstraint(this.dsl);
    return constraint.kind === 'known'
      ? constraint.fn(nodeId, node, graph)
      : true;
  }

  public matchEdge(
    sourceId: NodeId,
    source: TgNodeAttributes,
    targetId: NodeId,
    target: TgNodeAttributes,
    edge: TgEdgeAttributes,
    graph: Operations,
  ): boolean {
    return EdgeQuery.compileEdge(this.dsl)(
      sourceId,
      source,
      targetId,
      target,
      edge,
      graph,
    );
  }

  public getDsl(): EdgeQueryDsl {
    return this.dsl;
  }

  private static compileSourceNodeConstraint(
    dsl: EdgeQueryDsl,
  ): SourceNodeConstraint {
    if ('any' in dsl) {
      return { kind: 'unknown' };
    }

    if ('and' in dsl) {
      const compiled = dsl.and
        .map((item) => EdgeQuery.compileSourceNodeConstraint(item))
        .filter(
          (item): item is { kind: 'known'; fn: SourceNodeMatchFn } =>
            item.kind === 'known',
        );

      if (compiled.length === 0) {
        return { kind: 'unknown' };
      }

      return {
        kind: 'known',
        fn: (nodeId, node, graph) =>
          compiled.every((item) => item.fn(nodeId, node, graph)),
      };
    }

    if ('or' in dsl) {
      const compiled = dsl.or.map((item) =>
        EdgeQuery.compileSourceNodeConstraint(item),
      );
      if (compiled.some((item) => item.kind === 'unknown')) {
        return { kind: 'unknown' };
      }

      return {
        kind: 'known',
        fn: (nodeId, node, graph) =>
          compiled.some(
            (item) => item.kind === 'known' && item.fn(nodeId, node, graph),
          ),
      };
    }

    if ('not' in dsl) {
      const compiled = EdgeQuery.compileSourceNodeConstraint(dsl.not);
      if (compiled.kind === 'unknown') {
        return { kind: 'unknown' };
      }

      return {
        kind: 'known',
        fn: (nodeId, node, graph) => !compiled.fn(nodeId, node, graph),
      };
    }

    const sourceMatcher = dsl.from ? NodeQuery.from(dsl.from) : undefined;
    if (!sourceMatcher) {
      return { kind: 'unknown' };
    }

    return {
      kind: 'known',
      fn: (nodeId, node, graph) => sourceMatcher.match(nodeId, node, graph),
    };
  }

  private static compileEdge(dsl: EdgeQueryDsl): EdgeMatchFn {
    if ('any' in dsl) {
      return () => true;
    }

    if ('and' in dsl) {
      const compiled = dsl.and.map((item) => EdgeQuery.compileEdge(item));
      return (sourceId, source, targetId, target, edge, graph) =>
        compiled.every((fn) =>
          fn(sourceId, source, targetId, target, edge, graph),
        );
    }

    if ('or' in dsl) {
      const compiled = dsl.or.map((item) => EdgeQuery.compileEdge(item));
      return (sourceId, source, targetId, target, edge, graph) =>
        compiled.some((fn) =>
          fn(sourceId, source, targetId, target, edge, graph),
        );
    }

    if ('not' in dsl) {
      const compiled = EdgeQuery.compileEdge(dsl.not);
      return (sourceId, source, targetId, target, edge, graph) =>
        !compiled(sourceId, source, targetId, target, edge, graph);
    }

    const sourceMatcher = dsl.from ? NodeQuery.from(dsl.from) : undefined;
    const targetMatcher = dsl.to ? NodeQuery.from(dsl.to) : undefined;
    const attrMatcher = dsl.attr ? EdgeQuery.compileAttr(dsl.attr) : undefined;

    return (sourceId, source, targetId, target, edge, graph) => {
      if (sourceMatcher && !sourceMatcher.match(sourceId, source, graph)) {
        return false;
      }
      if (targetMatcher && !targetMatcher.match(targetId, target, graph)) {
        return false;
      }
      if (attrMatcher && !attrMatcher(edge)) {
        return false;
      }
      return true;
    };
  }

  private static compileAttr(
    attr: z.infer<typeof AttrPredicateSchema>,
  ): (edge: TgEdgeAttributes) => boolean {
    return (edge) => {
      const value = EdgeQuery.getValueAtPath(
        edge as Record<string, unknown>,
        attr.key,
      );
      return EdgeQuery.matchPredicate(value, attr);
    };
  }

  private static matchPredicate(
    value: unknown,
    predicate: Omit<AttrPredicate, 'key'>,
  ): boolean {
    if (predicate.eq !== undefined) {
      return value === predicate.eq;
    }
    if (predicate.in !== undefined) {
      const candidates = predicate.in;
      if (Array.isArray(value)) {
        return value.some((entry) => candidates.some((item) => item === entry));
      }
      return candidates.some((item) => item === value);
    }
    if (predicate.contains !== undefined) {
      if (Array.isArray(value)) {
        return value.some((entry) => entry === predicate.contains);
      }
      return String(value ?? '').includes(predicate.contains);
    }
    if (predicate.startsWith !== undefined) {
      const text = String(value ?? '');
      const needles = Array.isArray(predicate.startsWith)
        ? predicate.startsWith
        : [predicate.startsWith];
      return needles.some((item) => text.startsWith(item));
    }
    if (predicate.endsWith !== undefined) {
      const text = String(value ?? '');
      const needles = Array.isArray(predicate.endsWith)
        ? predicate.endsWith
        : [predicate.endsWith];
      return needles.some((item) => text.endsWith(item));
    }
    if (predicate.exists !== undefined) {
      return predicate.exists ? value !== undefined : value === undefined;
    }
    return false;
  }

  private static getValueAtPath(
    target: Record<string, unknown>,
    path: string,
  ): unknown {
    if (!path) {
      return undefined;
    }
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object' && key in (acc as object)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, target);
  }
}
