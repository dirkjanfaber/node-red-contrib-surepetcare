import { NodeAPI, NodeDef } from 'node-red';
import { SurepetcareBackend } from '../../types/surepetcare';

type PetLocation = 'inside' | 'outside';

const LOCATION_TO_WHERE: Record<PetLocation, 1 | 2> = {
  inside: 1,
  outside: 2,
};

interface SurepetcarePetControlNodeDef extends NodeDef {
  config: string;
  petId: string;
  location: PetLocation;
}

export = function (RED: NodeAPI) {
  function SurepetcarePetControlNode(this: any, config: SurepetcarePetControlNodeDef) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.config) as any;

    this.on('input', async (msg: any) => {
      const api: SurepetcareBackend = configNode.getAPI();
      const petId: string = msg.payload?.petId ?? config.petId;
      const location: PetLocation = msg.payload?.location ?? config.location;
      const where = LOCATION_TO_WHERE[location];

      try {
        await api.setPetLocation(petId, where);

        let statusText: string = location;
        try {
          const pets = await api.getPets();
          const pet = pets.find(p => String(p.id) === petId);
          if (pet) {
            statusText = `${pet.name}: ${location}`;
          }
        } catch {
          // Location was already set successfully - a failure to fetch the
          // pet's name for the status text shouldn't surface as an error.
        }

        this.status({ fill: 'green', shape: 'dot', text: statusText });
        msg.payload = { petId, location, where };
        this.send(msg);
      } catch (err: any) {
        this.status({ fill: 'red', shape: 'ring', text: err.message });
        this.error(err.message, msg);
      }
    });

    this.status({ fill: 'yellow', shape: 'ring', text: 'idle' });
  }

  RED.nodes.registerType('surepetcare-pet-control', SurepetcarePetControlNode);
};
