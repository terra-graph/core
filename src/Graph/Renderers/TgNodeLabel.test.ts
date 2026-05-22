import { TgNode, asNodeId } from '../TgGraph.js';
import { TgNodeLabel } from './TgNodeLabel.js';

describe('TgNodeLabel.getLabelComponents', () => {
  it('shoud return empty components when terraform is missing', () => {
    const node = { id: asNodeId('node-a') } as TgNode;

    const subject = new TgNodeLabel(node);

    expect(subject.getLabelComponents()).toEqual({});
  });

  it('shoud prefer parentModuleName for the name component', () => {
    const node: TgNode = {
      id: asNodeId('node-b'),
      terraform: {
        kind: 'resource',
        address: 'module.network.aws_security_group.this',
        resource: 'aws_security_group',
        name: 'this',
        parentModuleName: 'network',
      },
    };

    const subject = new TgNodeLabel(node);

    expect(subject.getLabelComponents()).toEqual({
      resourceName: 'aws_security_group',
      name: 'network',
    });
  });
});

describe('TgNodeLabel.getLabel', () => {
  it('shoud prefer parentModuleName for resources', () => {
    const node: TgNode = {
      id: asNodeId('node-c'),
      terraform: {
        kind: 'resource',
        address: 'module.network.aws_security_group.this',
        resource: 'aws_security_group',
        name: 'this',
        parentModuleName: 'network',
      },
    };

    const subject = new TgNodeLabel(node);

    expect(subject.getLabel()).toBe('aws_security_group.network');
  });

  it('shoud ignore parentModuleName for modules', () => {
    const node: TgNode = {
      id: asNodeId('node-d'),
      terraform: {
        kind: 'module',
        address: 'module.app',
        resource: 'module',
        name: 'app',
        parentModuleName: 'parent',
      },
    };

    const subject = new TgNodeLabel(node);

    expect(subject.getLabel()).toBe('module.app');
  });

  it('shoud append label endings when present', () => {
    const node: TgNode = {
      id: asNodeId('node-e'),
      terraform: {
        kind: 'resource',
        address: 'aws_s3_bucket.bucket',
        resource: 'aws_s3_bucket',
        name: 'bucket',
      },
      hints: {
        label: {
          end: 'id',
        },
      },
    };

    const subject = new TgNodeLabel(node);

    expect(subject.getLabel()).toBe('aws_s3_bucket.bucket.id');
  });

  it('should prefer projection labels when terraform metadata is missing', () => {
    const node: TgNode = {
      id: asNodeId('node-projection'),
      projection: {
        layer: 'core',
        address: 'aws.lambda:handler[0]',
        label: 'handler[0]',
      },
    };

    const subject = new TgNodeLabel(node);

    expect(subject.getLabel()).toBe('handler[0]');
  });
});
