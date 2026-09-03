import z from 'zod';
import { GraphDecorator } from '../Decorator.js';
import {
  TgGraph,
  TgNode,
  TgNodeTerraformState,
  TgNodeTerraformStateBase,
  TgNodeTerraformStateInstance,
} from '../TgGraph.js';

export const TerraformIndexSchema = z.union([z.number(), z.string()]);

export const TerraformShowResourceSchema = z.object({
  address: z.string().min(1),
  module_address: z.string().optional(),
  mode: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  index: TerraformIndexSchema.optional(),
  provider_name: z.string().optional(),
  deposed: z.string().optional(),
  previous_address: z.string().optional(),
  values: z.unknown().nullable().optional(),
});

export type TerraformShowResource = z.infer<typeof TerraformShowResourceSchema>;

export type TerraformShowModule = {
  resources?: TerraformShowResource[];
  child_modules?: TerraformShowModule[];
};

export const TerraformShowModuleSchema: z.ZodType<TerraformShowModule> = z.lazy(
  () =>
    z.object({
      resources: z.array(TerraformShowResourceSchema).optional(),
      child_modules: z.array(TerraformShowModuleSchema).optional(),
    }),
);

type TerraformStateSource = TgNodeTerraformState['source'];

export abstract class TfShowDecoratorBase<TInput, TParsed>
  implements GraphDecorator<string | TInput>
{
  protected abstract readonly source: TerraformStateSource;
  protected abstract readonly decoratorName: string;

  protected abstract parsePayload(raw: unknown): TParsed;
  protected abstract resolveRootModule(parsed: TParsed): TerraformShowModule;
  protected afterDecorate(graph: TgGraph, _parsed: TParsed): TgGraph {
    return graph;
  }

  public decorate(graph: Readonly<TgGraph>, input: string | TInput): TgGraph {
    const parsed = this.parsePayload(parseJsonInput(input, this.decoratorName));
    const instancesByAddress = buildStateByBaseAddress(
      collectShowResources(this.resolveRootModule(parsed)),
    );

    return this.afterDecorate(
      decorateTerraformState(graph, instancesByAddress, this.source),
      parsed,
    );
  }
}

const parseJsonInput = <TParsed>(
  input: string | TParsed,
  source: string,
): unknown => {
  if (typeof input !== 'string') {
    return input;
  }

  try {
    return JSON.parse(input);
  } catch {
    throw new Error(`${source} expected a valid terraform show -json payload`);
  }
};

const decorateTerraformState = (
  graph: Readonly<TgGraph>,
  instancesByAddress: Map<string, TgNodeTerraformStateInstance[]>,
  source: TerraformStateSource,
): TgGraph => {
  const nodes = Object.fromEntries(
    Object.entries(graph.nodes).map(([nodeId, node]) => {
      const copiedNode = copyNode(node);
      const nodeAddress = copiedNode.terraform?.address;
      if (!nodeAddress) {
        return [nodeId, copiedNode];
      }

      const instances = instancesByAddress.get(normalizeAddress(nodeAddress));
      if (!instances || instances.length === 0) {
        return [nodeId, copiedNode];
      }

      const effective = pickBestInstance(nodeAddress, instances);

      const state: TgNodeTerraformState = {
        source,
        effective: copyStateInstance(effective),
        instances: instances.map(copyStateInstance),
      };

      return [
        nodeId,
        {
          ...copiedNode,
          terraform: {
            ...copiedNode.terraform,
            state,
          },
        },
      ];
    }),
  ) as TgGraph['nodes'];

  return {
    ...graph,
    description: { ...graph.description },
    nodes,
    edges: graph.edges.map((edge) => {
      const copied = { ...edge };
      if (edge.attributes !== undefined) {
        copied.attributes = { ...edge.attributes };
      }
      return copied;
    }),
  };
};

const copyNode = (node: TgNode): TgNode => {
  return {
    ...node,
    terraform: node.terraform
      ? {
          ...node.terraform,
          state: node.terraform.state
            ? {
                ...node.terraform.state,
                effective: node.terraform.state.effective
                  ? copyStateInstance(node.terraform.state.effective)
                  : null,
                instances:
                  node.terraform.state.instances.map(copyStateInstance),
              }
            : undefined,
        }
      : node.terraform,
  };
};

const copyStateInstance = (
  value: TgNodeTerraformStateInstance,
): TgNodeTerraformStateInstance => {
  return {
    ...value,
    values: value.values ?? null,
  };
};

const buildStateByBaseAddress = (
  resources: TerraformShowResource[],
): Map<string, TgNodeTerraformStateInstance[]> => {
  const byAddress = new Map<string, TgNodeTerraformStateInstance[]>();

  for (const resource of resources) {
    const baseAddress = normalizeAddress(resource.address);
    if (baseAddress.length === 0) {
      continue;
    }

    const snapshot: TgNodeTerraformStateInstance = {
      ...toStateBase(resource),
      values: resource.values ?? null,
    };

    const existing = byAddress.get(baseAddress) ?? [];
    byAddress.set(baseAddress, [...existing, snapshot]);
  }

  return byAddress;
};

const collectShowResources = (
  module: TerraformShowModule,
): TerraformShowResource[] => {
  const resources = [...(module.resources ?? [])];
  for (const child of module.child_modules ?? []) {
    resources.push(...collectShowResources(child));
  }
  return resources;
};

const toStateBase = (
  value: Pick<
    TgNodeTerraformStateBase,
    | 'address'
    | 'module_address'
    | 'mode'
    | 'type'
    | 'name'
    | 'index'
    | 'provider_name'
    | 'deposed'
    | 'previous_address'
  >,
): TgNodeTerraformStateBase => {
  const base: TgNodeTerraformStateBase = {
    address: value.address,
  };

  if (value.module_address !== undefined) {
    base.module_address = value.module_address;
  }
  if (value.mode !== undefined) {
    base.mode = value.mode;
  }
  if (value.type !== undefined) {
    base.type = value.type;
  }
  if (value.name !== undefined) {
    base.name = value.name;
  }
  if (value.index !== undefined) {
    base.index = value.index;
  }
  if (value.provider_name !== undefined) {
    base.provider_name = value.provider_name;
  }
  if (value.deposed !== undefined) {
    base.deposed = value.deposed;
  }
  if (value.previous_address !== undefined) {
    base.previous_address = value.previous_address;
  }

  return base;
};

const pickBestInstance = (
  nodeAddress: string,
  candidates: TgNodeTerraformStateInstance[],
): TgNodeTerraformStateInstance => {
  const exact = candidates.find((item) => item.address === nodeAddress);
  if (exact) {
    return exact;
  }

  return [...candidates].sort((a, b) => a.address.localeCompare(b.address))[0];
};

const normalizeAddress = (address: string): string => {
  return address.replace(/\[[^\]]+\]/g, '');
};
