import type { AdapterOperations } from './Operations/Operations.js';
import type {
  NodeId,
  TgNodeAttributes,
  TgSemanticFactConfidence,
} from './TgGraph.js';

export type SemanticReferenceResolutionConfidence = Extract<
  TgSemanticFactConfidence,
  'exact' | 'structural' | 'heuristic'
>;

export type SemanticReferenceCandidate =
  | {
      kind: 'node';
      reference: string;
      confidence: SemanticReferenceResolutionConfidence;
      score: number;
      reason: string;
      nodeId: NodeId;
      address: string;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: 'scope';
      reference: string;
      confidence: SemanticReferenceResolutionConfidence;
      score: number;
      reason: string;
      addressPrefix: string;
      metadata?: Record<string, unknown>;
    };

export type SemanticReferenceResolutionContext = {
  graph: AdapterOperations;
  sourceNodeId: NodeId;
  sourceNode: TgNodeAttributes;
  reference: string;
  sourceIndex?: string | number;
};

export interface SemanticReferenceHeuristic {
  readonly name: string;
  resolve(
    context: SemanticReferenceResolutionContext,
  ): SemanticReferenceCandidate[];
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stripWrappingQuotes = (value: string): string =>
  value.replace(/^["']|["']$/g, '');

const splitAddressSegments = (reference: string): string[] => {
  const segments: string[] = [];
  let current = '';
  let bracketDepth = 0;

  for (const char of reference) {
    if (char === '[') {
      bracketDepth += 1;
      current += char;
      continue;
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }
    if (char === '.' && bracketDepth === 0) {
      segments.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments.filter((segment) => segment.length > 0);
};

const toAddressCandidates = (reference: string): string[] => {
  const segments = splitAddressSegments(reference);
  const candidates: string[] = [];

  for (let length = segments.length; length >= 2; length -= 1) {
    candidates.push(segments.slice(0, length).join('.'));
  }

  return [...new Set(candidates)];
};

const tokenize = (value: string | number | undefined): string[] => {
  if (value === undefined) {
    return [];
  }

  return String(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 0);
};

const getNodeTerraformAddress = (
  node: TgNodeAttributes | undefined,
): string | undefined => node?.terraform?.address;

const getNodeTerraformAddresses = (
  node: TgNodeAttributes | undefined,
): string[] => {
  if (!node?.terraform) {
    return [];
  }

  const addresses = new Set<string>();

  if (node.terraform.address) {
    addresses.add(node.terraform.address);
  }

  const effectiveAddress = node.terraform.state?.effective?.address;
  if (effectiveAddress) {
    addresses.add(effectiveAddress);
  }

  for (const instance of node.terraform.state?.instances ?? []) {
    if (instance.address) {
      addresses.add(instance.address);
    }
  }

  return [...addresses];
};

const getSourceIndex = (
  sourceNode: TgNodeAttributes,
  explicitIndex?: string | number,
): string | number | undefined =>
  explicitIndex ?? sourceNode.terraform?.state?.effective?.index;

const findTerraformNodesByAddress = (
  graph: AdapterOperations,
  address: string,
): Array<{ nodeId: NodeId; address: string }> => {
  const matches: Array<{ nodeId: NodeId; address: string }> = [];

  for (const nodeId of graph.nodeIds()) {
    const node = graph.getNodeAttributes(nodeId);
    const nodeAddresses = getNodeTerraformAddresses(node);
    const nodeAddress = nodeAddresses.find(
      (candidateAddress) => candidateAddress === address,
    );
    if (!nodeAddress) {
      continue;
    }

    matches.push({
      nodeId,
      address: nodeAddress,
    });
  }

  return matches;
};

const collectScopePrefixes = (
  graph: AdapterOperations,
  moduleReference: string,
): string[] => {
  const prefixes = new Set<string>();
  const prefix = `${moduleReference}[`;

  for (const nodeId of graph.nodeIds()) {
    const node = graph.getNodeAttributes(nodeId);
    for (const address of getNodeTerraformAddresses(node)) {
      if (!address.startsWith(prefix)) {
        continue;
      }

      const suffix = address.slice(moduleReference.length);
      const closingIndex = suffix.indexOf(']');
      if (closingIndex < 0) {
        continue;
      }

      prefixes.add(`${moduleReference}${suffix.slice(0, closingIndex + 1)}`);
    }
  }

  return [...prefixes];
};

const getScopeInstanceKey = (scopePrefix: string): string | undefined => {
  const start = scopePrefix.lastIndexOf('[');
  const end = scopePrefix.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return undefined;
  }

  return stripWrappingQuotes(scopePrefix.slice(start + 1, end));
};

const exactReferenceHeuristic: SemanticReferenceHeuristic = {
  name: 'exact_reference',
  resolve: ({ graph, reference }) => {
    return toAddressCandidates(reference).flatMap((candidate, index) =>
      findTerraformNodesByAddress(graph, candidate).map((match) => ({
        kind: 'node' as const,
        reference,
        confidence: 'exact' as const,
        score: 100 - index,
        reason:
          candidate === reference
            ? 'reference matched terraform.address exactly'
            : `reference attribute path reduced to terraform.address '${candidate}'`,
        nodeId: match.nodeId,
        address: match.address,
      })),
    );
  },
};

const moduleInstanceByIndexHeuristic: SemanticReferenceHeuristic = {
  name: 'module_instance_by_index',
  resolve: ({ graph, reference, sourceIndex }) => {
    if (!/^module\.[^.]+$/.test(reference) || sourceIndex === undefined) {
      return [];
    }

    const sourceTokens = tokenize(sourceIndex);
    if (sourceTokens.length === 0) {
      return [];
    }

    const prefixes = collectScopePrefixes(graph, reference);
    const candidates = prefixes
      .map((addressPrefix) => {
        const instanceKey = getScopeInstanceKey(addressPrefix);
        if (!instanceKey) {
          return undefined;
        }

        const instanceTokens = tokenize(instanceKey);
        if (instanceTokens.length === 0) {
          return undefined;
        }

        const overlappingTokens = instanceTokens.filter((token) =>
          sourceTokens.includes(token),
        );
        if (overlappingTokens.length === 0) {
          return undefined;
        }

        const exactPrefixMatch = String(sourceIndex)
          .toLowerCase()
          .startsWith(instanceKey.toLowerCase());

        return {
          kind: 'scope' as const,
          reference,
          confidence: 'heuristic' as const,
          score:
            overlappingTokens.length * 10 + (exactPrefixMatch ? 5 : 0) + 20,
          reason: exactPrefixMatch
            ? `state index '${sourceIndex}' starts with module instance key '${instanceKey}'`
            : `state index '${sourceIndex}' shares tokens with module instance key '${instanceKey}'`,
          addressPrefix,
          metadata: {
            sourceIndex,
            instanceKey,
            overlappingTokens,
          },
        };
      })
      .filter((candidate) => candidate !== undefined);

    return candidates;
  },
};

export const defaultSemanticReferenceHeuristics: SemanticReferenceHeuristic[] =
  [exactReferenceHeuristic, moduleInstanceByIndexHeuristic];

export const collectTerraformConfigurationReferences = (
  expression: unknown,
): string[] => {
  const references: string[] = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (!isObjectRecord(value)) {
      return;
    }

    const rawReferences = value.references;
    if (Array.isArray(rawReferences)) {
      for (const reference of rawReferences) {
        if (typeof reference === 'string' && reference.trim().length > 0) {
          references.push(reference);
        }
      }
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(expression);
  return [...new Set(references)];
};

export const resolveSemanticReferenceCandidates = (
  context: Omit<SemanticReferenceResolutionContext, 'sourceIndex'> & {
    sourceIndex?: string | number;
    heuristics?: SemanticReferenceHeuristic[];
  },
): SemanticReferenceCandidate[] => {
  const resolvedContext: SemanticReferenceResolutionContext = {
    ...context,
    sourceIndex: getSourceIndex(context.sourceNode, context.sourceIndex),
  };

  const candidates = (context.heuristics ?? defaultSemanticReferenceHeuristics)
    .flatMap((heuristic) => heuristic.resolve(resolvedContext))
    .sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key =
      candidate.kind === 'node'
        ? `${candidate.kind}:${candidate.nodeId}:${candidate.reference}:${candidate.reason}`
        : `${candidate.kind}:${candidate.addressPrefix}:${candidate.reference}:${candidate.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const selectBestSemanticReferenceCandidate = (
  candidates: SemanticReferenceCandidate[],
): SemanticReferenceCandidate | undefined => {
  const [best, second] = candidates;
  if (!best) {
    return undefined;
  }

  if (!second || best.score > second.score) {
    return best;
  }

  return undefined;
};

export const findTerraformNodesWithinScopePrefix = (
  graph: AdapterOperations,
  scopePrefix: string,
): Array<{ nodeId: NodeId; node: TgNodeAttributes; address: string }> => {
  const prefix = `${scopePrefix}.`;

  return graph.nodeIds().flatMap((nodeId) => {
    const node = graph.getNodeAttributes(nodeId);
    const address = getNodeTerraformAddresses(node).find((candidateAddress) =>
      candidateAddress.startsWith(prefix),
    );
    if (!node || !address) {
      return [];
    }

    return [{ nodeId, node, address }];
  });
};
