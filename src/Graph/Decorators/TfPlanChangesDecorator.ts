import z from 'zod';
import { NodeId, TgGraph, TgTerraformResourceChange } from '../TgGraph.js';

const TerraformPlanResourceChangeSchema = z.object({
  address: z.string().min(1),
  previous_address: z.string().min(1).optional(),
  action_reason: z.string().min(1).optional(),
  change: z.object({
    actions: z.array(z.string().min(1)),
    replace_paths: z.array(z.unknown()).optional(),
    before_sensitive: z.unknown().optional(),
    after_sensitive: z.unknown().optional(),
    after_unknown: z.unknown().optional(),
  }),
});

const TerraformPlanChangesShowSchema = z.object({
  resource_changes: z.array(TerraformPlanResourceChangeSchema),
});

export type TerraformPlanChangesShowJson = z.infer<
  typeof TerraformPlanChangesShowSchema
>;

export class TfPlanChangesDecorator {
  public decorate(
    graph: Readonly<TgGraph>,
    input: string | TerraformPlanChangesShowJson,
  ): TgGraph {
    const parsed = this.parsePayload(
      parseJsonInput(input, TfPlanChangesDecorator.name),
    );
    const nodesByAddress = this.buildNodesByAddress(graph);
    const resources: Record<string, TgTerraformResourceChange> = {};

    for (const change of parsed.resource_changes) {
      const nodeId = this.resolveNodeId(change.address, nodesByAddress);
      const resourceChange: TgTerraformResourceChange = {
        address: change.address,
        matched: nodeId !== undefined,
        actions: [...change.change.actions],
      };

      if (nodeId !== undefined) {
        resourceChange.nodeId = nodeId;
      }
      if (change.previous_address !== undefined) {
        resourceChange.previousAddress = change.previous_address;
      }
      if (change.action_reason !== undefined) {
        resourceChange.actionReason = change.action_reason;
      }
      if (change.change.replace_paths !== undefined) {
        resourceChange.replacePaths = change.change.replace_paths;
      }
      if (change.change.before_sensitive !== undefined) {
        resourceChange.beforeSensitive = change.change.before_sensitive;
      }
      if (change.change.after_sensitive !== undefined) {
        resourceChange.afterSensitive = change.change.after_sensitive;
      }
      if (change.change.after_unknown !== undefined) {
        resourceChange.afterUnknown = change.change.after_unknown;
      }

      resources[change.address] = resourceChange;
    }

    return {
      ...graph,
      nodes: { ...graph.nodes },
      edges: graph.edges.map((edge) => ({ ...edge })),
      changes: {
        source: 'terraform_plan',
        resources,
      },
    };
  }

  private parsePayload(raw: unknown): TerraformPlanChangesShowJson {
    const parsed = TerraformPlanChangesShowSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `TfPlanChangesDecorator received unsupported Terraform plan changes shape: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  private buildNodesByAddress(graph: Readonly<TgGraph>): Map<string, NodeId> {
    const byAddress = new Map<string, NodeId>();
    for (const node of Object.values(graph.nodes)) {
      const address = node.terraform?.address;
      const kind = node.terraform?.kind;
      if (!address || kind !== 'resource') {
        continue;
      }
      byAddress.set(address, node.id);
      byAddress.set(normalizeAddress(address), node.id);
    }
    return byAddress;
  }

  private resolveNodeId(
    address: string,
    nodesByAddress: Map<string, NodeId>,
  ): NodeId | undefined {
    return (
      nodesByAddress.get(address) ??
      nodesByAddress.get(normalizeAddress(address))
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

const normalizeAddress = (address: string): string =>
  address.replace(/\[[^\]]+\]/g, '');
