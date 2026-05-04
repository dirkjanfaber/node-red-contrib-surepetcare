import { NodeAPI, NodeDef } from 'node-red';
import { LockState, SurepetcareBackend } from '../../types/sureflap';

interface SureflapControlNodeDef extends NodeDef {
  config: string;
  deviceId: string;
  lockState: LockState;
}

export = function (RED: NodeAPI) {
  function SureflapControlNode(this: any, config: SureflapControlNodeDef) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.config) as any;

    this.on('input', async (msg: any) => {
      const api: SurepetcareBackend = configNode.getAPI();
      const deviceId: string = msg.payload?.deviceId ?? config.deviceId;
      const lockState: LockState = msg.payload?.lockState ?? config.lockState;

      try {
        await api.setLockState(deviceId, lockState);
        this.status({ fill: 'green', shape: 'dot', text: `lock: ${lockState}` });
        msg.payload = { deviceId, lockState };
        this.send(msg);
      } catch (err: any) {
        this.status({ fill: 'red', shape: 'ring', text: err.message });
        this.error(err.message, msg);
      }
    });

    this.status({ fill: 'yellow', shape: 'ring', text: 'idle' });
  }

  RED.nodes.registerType('surepetcare-control', SureflapControlNode);
};
