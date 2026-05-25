import z from 'zod';
import { NodeId, TgGraph, edgeIdFrom } from '../TgGraph.js';
import {
  TerraformShowModule,
  TerraformShowModuleSchema,
  TfShowDecoratorBase,
} from './TfShowDecoratorBase.js';

type TerraformPlanConfigurationResource = {
  address: string;
  expressions?: Record<string, unknown>;
};

type TerraformPlanConfigurationModule = {
  resources?: TerraformPlanConfigurationResource[];
  module_calls?: Record<string, { module?: TerraformPlanConfigurationModule }>;
};

const TerraformPlanConfigurationResourceSchema = z.object({
  address: z.string().min(1),
  expressions: z.record(z.unknown()).optional(),
});

const TerraformPlanConfigurationModuleSchema: z.ZodType<TerraformPlanConfigurationModule> =
  z.lazy(() =>
    z.object({
      resources: z.array(TerraformPlanConfigurationResourceSchema).optional(),
      module_calls: z
        .record(
          z.object({
            module: TerraformPlanConfigurationModuleSchema.optional(),
          }),
        )
        .optional(),
    }),
  );

const TerraformPlanShowSchema = z.object({
  planned_values: z.object({
    root_module: TerraformShowModuleSchema,
  }),
  configuration: z
    .object({
      root_module: TerraformPlanConfigurationModuleSchema,
    })
    .optional(),
});

export type TerraformPlanShowJson = z.infer<typeof TerraformPlanShowSchema>;

export class TfPlanDecorator extends TfShowDecoratorBase<
  TerraformPlanShowJson,
  TerraformPlanShowJson
> {
  protected readonly source = 'plan_show' as const;
  protected readonly decoratorName = 'TfPlanDecorator';

  protected parsePayload(raw: unknown): TerraformPlanShowJson {
    const parsed = TerraformPlanShowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `TfPlanDecorator received unsupported Terraform plan show shape: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  protected resolveRootModule(
    parsed: TerraformPlanShowJson,
  ): TerraformShowModule {
    return parsed.planned_values.root_module;
  }

  protected override afterDecorate(
    graph: TgGraph,
    parsed: TerraformPlanShowJson,
  ): TgGraph {
    const rootModule = parsed.configuration?.root_module;
    if (!rootModule) {
      return graph;
    }

    const nodesByAddress = buildNodesByAddress(graph);
    const nextEdges = [...graph.edges];
    const seen = new Set(
      nextEdges.map((edge) => `${String(edge.from)}->${String(edge.to)}`),
    );

    for (const resource of collectConfigurationResources(rootModule)) {
      const sourceNodeId = resolveNodeId(resource.address, nodesByAddress);
      if (!sourceNodeId) {
        continue;
      }

      for (const reference of collectExpressionReferences(
        resource.expressions,
      )) {
        const targetNodeId = resolveNodeId(reference, nodesByAddress);
        if (!targetNodeId || targetNodeId === sourceNodeId) {
          continue;
        }

        const key = `${String(sourceNodeId)}->${String(targetNodeId)}`;
        if (seen.has(key)) {
          continue;
        }

        nextEdges.push({
          id: edgeIdFrom(
            sourceNodeId,
            targetNodeId,
            'terraform:plan_configuration_reference',
          ),
          from: sourceNodeId,
          to: targetNodeId,
        });
        seen.add(key);
      }
    }

    return {
      ...graph,
      edges: nextEdges,
    };
  }
}

const collectConfigurationResources = (
  module: TerraformPlanConfigurationModule,
): TerraformPlanConfigurationResource[] => {
  const resources = [...(module.resources ?? [])];
  for (const call of Object.values(module.module_calls ?? {})) {
    if (!call.module) {
      continue;
    }
    resources.push(...collectConfigurationResources(call.module));
  }
  return resources;
};

const collectExpressionReferences = (
  expressions: TerraformPlanConfigurationResource['expressions'],
): string[] => {
  const references = new Set<string>();
  for (const expression of Object.values(expressions ?? {})) {
    collectNestedReferences(expression, references);
  }
  return [...references];
};

const collectNestedReferences = (value: unknown, target: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNestedReferences(entry, target);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (
    'references' in value &&
    Array.isArray((value as { references?: unknown }).references)
  ) {
    for (const reference of (value as { references: unknown[] }).references) {
      if (typeof reference === 'string' && reference.length > 0) {
        target.add(reference);
      }
    }
  }

  for (const entry of Object.values(value)) {
    collectNestedReferences(entry, target);
  }
};

const buildNodesByAddress = (graph: TgGraph): Map<string, NodeId> => {
  const byAddress = new Map<string, NodeId>();
  for (const node of Object.values(graph.nodes)) {
    const address = node.terraform?.address;
    const kind = node.terraform?.kind;
    if (!address || !kind || !['resource', 'data', 'output'].includes(kind)) {
      continue;
    }
    byAddress.set(address, node.id);
    byAddress.set(normalizeAddress(address), node.id);
  }
  return byAddress;
};

const resolveNodeId = (
  reference: string,
  nodesByAddress: Map<string, NodeId>,
): NodeId | undefined => {
  const outputAddress = toModuleOutputAddress(reference);
  if (outputAddress) {
    const outputNodeId =
      nodesByAddress.get(outputAddress) ??
      nodesByAddress.get(normalizeAddress(outputAddress));
    if (outputNodeId) {
      return outputNodeId;
    }
  }

  let candidate = reference;
  while (candidate.length > 0) {
    const normalizedCandidate = normalizeAddress(candidate);
    const resolved =
      nodesByAddress.get(candidate) ?? nodesByAddress.get(normalizedCandidate);
    if (resolved) {
      return resolved;
    }

    const nextIndex = candidate.lastIndexOf('.');
    if (nextIndex < 0) {
      break;
    }
    candidate = candidate.slice(0, nextIndex);
  }

  return undefined;
};

const toModuleOutputAddress = (reference: string): string | undefined => {
  const segments = reference.split('.');
  if (segments.length < 3 || segments[0] !== 'module') {
    return undefined;
  }

  return `${segments.slice(0, 2).join('.')}.output.${segments.slice(2).join('.')}`;
};

const normalizeAddress = (address: string): string =>
  address.replace(/\[[^\]]+\]/g, '');
