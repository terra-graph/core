# NodeQuery DSL

`NodeQuery` is the validated DSL used by rules to match nodes and edges.

**Top-Level Forms**
- `{ any: true }`
- `{ and: QueryDsl[] }`
- `{ or: QueryDsl[] }`
- `{ not: QueryDsl }`
- `{ attr: { key, <predicate> } }`
- `{ nodeId: { <predicate> } }`
- `{ edge: { in?: QueryDsl, out?: QueryDsl } }`

**Predicates**
- Exactly one predicate operation per predicate object.
- Supported operations: `eq`, `in`, `contains`, `startsWith`, `endsWith`, `exists`.
- `startsWith` and `endsWith` accept `string` or `string[]`.

**Examples**
```ts
// Match any node
{ any: true }

// Match a node by attribute
{ attr: { key: 'terraform.kind', eq: 'module' } }

// Match by node id prefix
{ nodeId: { startsWith: 'cluster_module.' } }

// Match nodes with an incoming edge from a resource
{ edge: { in: { attr: { key: 'terraform.kind', eq: 'resource' } } } }
```
