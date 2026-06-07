import { QuerySchema } from './QuerySchema.js';

describe('QuerySchema', () => {
  it('shoud parse valid query definitions', () => {
    const valid = QuerySchema.parse({
      and: [
        { any: true },
        {
          or: [
            { nodeId: { startsWith: 'resource.' } },
            { children: { count: 1 } },
          ],
        },
      ],
    });

    expect(valid).toEqual({
      and: [
        { any: true },
        {
          or: [
            { nodeId: { startsWith: 'resource.' } },
            { children: { count: 1 } },
          ],
        },
      ],
    });
  });

  it('shoud parse numeric comparison predicates', () => {
    const valid = QuerySchema.parse({
      attr: {
        key: 'projection.relationship.semanticFact.matchCertainty',
        lt: 80,
      },
    });

    expect(valid).toEqual({
      attr: {
        key: 'projection.relationship.semanticFact.matchCertainty',
        lt: 80,
      },
    });
  });

  it('shoud reject predicates that define multiple operations', () => {
    expect(() =>
      QuerySchema.parse({
        attr: {
          key: 'label',
          eq: 'a',
          in: ['a', 'b'],
        },
      }),
    ).toThrow(
      'attr must specify exactly one of: eq | in | contains | startsWith | endsWith | lt | lte | gt | gte | exists',
    );
  });

  it('shoud reject child predicate definitions that define no operation', () => {
    expect(() =>
      QuerySchema.parse({
        children: {
          exists: true,
          count: 1,
        },
      }),
    ).toThrow('children must define exactly one of: exists | count');
  });

  it('shoud reject edge predicates with no in/out matcher', () => {
    expect(() =>
      QuerySchema.parse({
        edge: {},
      }),
    ).toThrow('edge must define at least one of: in | out');
  });
});
