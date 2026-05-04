import { NodeAPI, NodeDef } from 'node-red';
import { SurepetcareBackend } from '../../types/sureflap';

interface SureflapPetsNodeDef extends NodeDef {
  config: string;
  pollInterval: number;
}

export = function (RED: NodeAPI) {
  function SureflapPetsNode(this: any, config: SureflapPetsNodeDef) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.config) as any;
    const intervalMs = (config.pollInterval ?? 60) * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;

    this.poll = async () => {
      const api: SurepetcareBackend = configNode.getAPI();
      try {
        const pets = await api.getPets();
        for (const pet of pets) {
          this.send({
            payload: {
              id: pet.id,
              name: pet.name,
              location: pet.position.where === 1 ? 'inside' : 'outside',
              where: pet.position.where,
              since: pet.position.since,
            },
          });
        }
        this.status({ fill: 'green', shape: 'dot', text: 'ok' });
      } catch (err: any) {
        this.status({ fill: 'red', shape: 'ring', text: err.message });
        this.error(err.message);
      }
    };

    this.on('input', () => this.poll());

    if (intervalMs > 0) {
      timer = setInterval(() => this.poll(), intervalMs);
    }

    this.on('close', () => {
      if (timer) clearInterval(timer);
    });

    this.status({ fill: 'yellow', shape: 'ring', text: 'idle' });
  }

  RED.nodes.registerType('surepetcare-pets', SureflapPetsNode);
};
