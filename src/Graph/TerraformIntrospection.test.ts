import {
  findFirstStringReference,
  isArrayOfUnknown,
  isObjectRecord,
  isTerraformValues,
  normalizeTerraformAddress,
  resolveNodeArn,
  resolveNodeReference,
  resolveTerraformStringFieldOrReference,
} from './TerraformIntrospection.js';
import { type NodeId, asNodeId } from './TgGraph.js';

describe('TerraformIntrospection', () => {
  it('should detect object, array, and terraform value shapes', () => {
    expect(isObjectRecord({ key: 'value' })).toBe(true);
    expect(isObjectRecord([])).toBe(false);
    expect(isObjectRecord(null)).toBe(false);

    expect(isArrayOfUnknown(['value'])).toBe(true);
    expect(isArrayOfUnknown('value')).toBe(false);

    expect(isTerraformValues({ arn: 'value' })).toBe(true);
    expect(isTerraformValues(undefined)).toBe(false);
  });

  it('should normalize terraform addresses and resolve node arns', () => {
    expect(
      normalizeTerraformAddress('module.app.aws_lambda_function.fn["x"]'),
    ).toBe('module.app.aws_lambda_function.fn');

    expect(resolveNodeArn(undefined)).toBeUndefined();
    expect(
      resolveNodeArn({
        terraform: {
          state: {
            source: 'plan_show',
            effective: {
              address: 'aws_lambda_function.fn',
              values: {
                arn: 42,
              },
            },
            instances: [],
          },
        },
      }),
    ).toBeUndefined();
    expect(
      resolveNodeArn({
        terraform: {
          state: {
            source: 'plan_show',
            effective: {
              address: 'aws_lambda_function.fn',
              values: {
                arn: 'arn:aws:lambda:eu-west-1:123:function:fn',
              },
            },
            instances: [],
          },
        },
      }),
    ).toBe('arn:aws:lambda:eu-west-1:123:function:fn');
  });

  it('should find first string references across terraform expression shapes', () => {
    expect(findFirstStringReference('direct')).toBe('direct');
    expect(
      findFirstStringReference([null, { references: ['ref.value'] }]),
    ).toBe('ref.value');
    expect(
      findFirstStringReference({
        nested: {
          deeper: ['ignored', { value: { references: ['deep.ref'] } }],
        },
      }),
    ).toBe('ignored');
    expect(findFirstStringReference([null, { nested: false }])).toBeUndefined();
    expect(
      findFirstStringReference({ references: [null, ''] }),
    ).toBeUndefined();
    expect(
      findFirstStringReference({ nested: { deeper: 42 } }),
    ).toBeUndefined();
  });

  it('should resolve terraform string fields from values or configuration references', () => {
    expect(
      resolveTerraformStringFieldOrReference(
        {
          terraform: {
            state: {
              source: 'plan_show',
              effective: {
                address: 'aws_pipes_pipe.example',
                values: {
                  source: 'arn:aws:sqs:eu-west-1:123:queue',
                },
              },
              instances: [],
            },
          },
        },
        'source',
      ),
    ).toBe('arn:aws:sqs:eu-west-1:123:queue');

    expect(
      resolveTerraformStringFieldOrReference(
        {
          terraform: {
            configuration: {
              source: 'plan_show',
              expressions: {
                target: {
                  references: ['aws_sfn_state_machine.example.arn'],
                },
              },
            },
          },
        },
        'target',
      ),
    ).toBe('aws_sfn_state_machine.example.arn');

    expect(
      resolveTerraformStringFieldOrReference(undefined, 'target'),
    ).toBeUndefined();
  });

  it('should resolve node references by exact, normalized, and parent address candidates', () => {
    const lambdaNodeId = asNodeId('lambda');
    const stateMachineNodeId = asNodeId('state-machine');

    const nodesByAddress = new Map<string, NodeId>([
      ['module.app.aws_lambda_function.fn', lambdaNodeId],
      ['aws_sfn_state_machine.example', stateMachineNodeId],
    ]);

    expect(
      resolveNodeReference(
        'module.app.aws_lambda_function.fn["abi"].arn',
        nodesByAddress,
      ),
    ).toBe(lambdaNodeId);
    expect(
      resolveNodeReference('aws_sfn_state_machine.example.arn', nodesByAddress),
    ).toBe(stateMachineNodeId);
    expect(
      resolveNodeReference('aws_unknown.example.arn', nodesByAddress),
    ).toBeUndefined();
  });
});
