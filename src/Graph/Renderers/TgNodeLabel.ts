import { TgNode } from '../TgGraph.js';

export type TgNodeLabelComponents = {
  resourceName?: string;
  name?: string;
};

export class TgNodeLabel {
  constructor(private readonly node: TgNode) {}

  public getLabelComponents(): TgNodeLabelComponents {
    const terraform = this.node.terraform;
    if (!terraform) {
      return {};
    }

    return {
      resourceName: terraform.resource,
      name: terraform.parentModuleName ?? terraform.name,
    };
  }

  public getLabel(): string {
    const { resourceName, name } = this.getLabelComponents();
    const kind = this.node.terraform?.kind;
    const parentModuleName = this.node.terraform?.parentModuleName ?? '';
    const terraformName = this.node.terraform?.name ?? '';

    let labelName = name ?? '';
    if (parentModuleName && kind === 'module') {
      labelName = terraformName;
    }

    if (this.node.hints?.label?.end) {
      labelName = `${labelName}.${this.node.hints.label.end}`;
    }

    if (resourceName && labelName) {
      return `${resourceName}.${labelName}`;
    }
    if (labelName) {
      return labelName;
    }
    if (resourceName) {
      return resourceName;
    }
    return String(this.node.id);
  }
}
