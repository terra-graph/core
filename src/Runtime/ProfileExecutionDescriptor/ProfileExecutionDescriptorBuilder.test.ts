import { Profile } from '../../Graph/Profile.js';
import { RemoveNode } from '../../Graph/Rules/Node/RemoveNode.js';
import {
  type SemanticDecorator,
  SemanticDecoratorRegistry,
} from '../../Graph/Semantics.js';
import { ProfileExecutionDescriptorBuilder } from './ProfileExecutionDescriptorBuilder.js';

describe('ProfileExecutionDescriptorBuilder.build', () => {
  it('shoud serialize expanded rule configuration and resolved decorator references', () => {
    const decorator: SemanticDecorator = {
      name: 'test',
      extract: ({ graph }) => graph,
      project: ({ graph }) => graph,
    };
    SemanticDecoratorRegistry.register('test-descriptor', () => decorator);
    const resolved = SemanticDecoratorRegistry.resolve({
      id: 'test-descriptor',
      config: { value: 1 },
    });
    const rule = new RemoveNode({
      node: { any: true },
      options: { decorator: resolved, values: [null, 'text', true, 1] },
    });
    const profile = new Profile('test', {});
    const result = new ProfileExecutionDescriptorBuilder().build(
      profile,
      [[rule]],
      [{ name: 'provider', version: '1' }],
    );
    expect(result.phases[0][0].config.options?.decorator).toEqual({
      id: 'test-descriptor',
      config: { value: 1 },
    });
    expect(result.dependencies).toEqual([{ name: 'provider', version: '1' }]);
  });
  it('shoud reject unsupported functions and decorators without configuration references', () => {
    const builder = new ProfileExecutionDescriptorBuilder();
    const profile = new Profile('test', {});
    const decorator: SemanticDecorator = {
      name: 'untracked',
      extract: ({ graph }) => graph,
      project: ({ graph }) => graph,
    };
    expect(() =>
      builder.build(
        profile,
        [
          [
            new RemoveNode({
              node: { any: true },
              options: { callback: () => {} },
            }),
          ],
        ],
        [],
      ),
    ).toThrow('unsupported');
    expect(() =>
      builder.build(
        profile,
        [[new RemoveNode({ node: { any: true }, options: { decorator } })]],
        [],
      ),
    ).toThrow('no serializable');
  });
});
