import { DirectedGraph } from 'graphology';
import { GraphologyAdapter } from '../Adapters/GraphologyAdapter.js';
import { TG_SCHEMA_VERSION, TgGraph, asNodeId } from '../TgGraph.js';
import { JsonRenderer } from './JsonRenderer.js';

describe('JsonRenderer.render', () => {
  it('shoud render tg graph JSON as string content', () => {
    const nodeA = asNodeId('json.node-a');
    const nodeB = asNodeId('json.node-b');
    const tg: TgGraph = {
      schemaVersion: TG_SCHEMA_VERSION,
      description: {
        source: 'unit-test',
      },
      nodes: {
        [nodeA]: { id: nodeA },
        [nodeB]: { id: nodeB },
      },
      edges: [],
    };

    const adapter = new GraphologyAdapter(new DirectedGraph()).withTgGraph(tg);
    const renderer = new JsonRenderer();

    const artifact = renderer.render(adapter);

    expect(artifact.mediaType).toBe('application/json');
    expect(artifact.extension).toBe('json');
    expect(artifact.content).toBe(JSON.stringify(adapter.toTgGraph()));
  });
});
