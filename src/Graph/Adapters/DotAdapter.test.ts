import { DirectedGraph } from 'graphology';
import { DotRenderer } from '../Renderers/DotRenderer.js';
import { asNodeId } from '../TgGraph.js';
import { DotAdapter } from './DotAdapter.js';

describe('DotAdapter.addRank', () => {
  it('shoud add and return ranks', () => {
    const adapter = new DotAdapter(new DirectedGraph());
    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const updated = adapter.addRank([nodeA, nodeB], 'same');

    expect(updated.getRanks()).toEqual([
      { mode: 'same', nodes: [nodeA, nodeB] },
    ]);
  });

  it('shoud default the rank mode to same', () => {
    const adapter = new DotAdapter(new DirectedGraph());
    const nodeA = asNodeId('node-a');

    const updated = adapter.addRank([nodeA]);

    expect(updated.getRanks()).toEqual([{ mode: 'same', nodes: [nodeA] }]);
  });
});

describe('DotAdapter.getRenderer', () => {
  it('shoud return a DotRenderer when options are provided', () => {
    const adapter = new DotAdapter(new DirectedGraph());

    const renderer = adapter.getRenderer({
      graph: { rankdir: 'TB' },
    });

    expect(renderer).toBeInstanceOf(DotRenderer);
  });

  it('shoud ignore non-object options', () => {
    const adapter = new DotAdapter(new DirectedGraph());

    const renderer = adapter.getRenderer('invalid' as unknown as object);

    expect(renderer).toBeInstanceOf(DotRenderer);
  });
});

describe('DotAdapter.clearRanks', () => {
  it('shoud clear ranks', () => {
    const adapter = new DotAdapter(new DirectedGraph());
    const nodeA = asNodeId('node-a');

    const updated = adapter.addRank([nodeA], 'min').clearRanks();

    expect(updated.getRanks()).toEqual([]);
  });
});
