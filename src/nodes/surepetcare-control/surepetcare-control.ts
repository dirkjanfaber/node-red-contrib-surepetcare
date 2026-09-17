import { NodeAPI, NodeDef } from 'node-red';
import { LockState, SurepetcareBackend } from '../../types/surepetcare';

const LOCK_STATE_LABELS: Record<LockState, string> = {
  0: 'unlocked',
  1: 'locked in',
  2: 'locked out',
  3: 'locked both ways',
};

// SurePetcare product IDs that don't have a lock to control (kept in sync
// with the productNames map in surepetcare-control.html, which also uses it
// to keep these off the editor's device picker). Unrecognised product IDs
// are assumed lockable so a newer/unlisted product isn't blocked here.
const NON_LOCKABLE_PRODUCTS: Record<number, string> = {
  1: 'Hub',
  8: 'Feeder Connect',
  13: 'Felaqua',
};

interface SurepetcareControlNodeDef extends NodeDef {
  config: string;
  deviceId: string;
  lockState: LockState;
}

export = function (RED: NodeAPI) {
  function SurepetcareControlNode(this: any, config: SurepetcareControlNodeDef) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.config) as any;

    this.on('input', async (msg: any) => {
      const api: SurepetcareBackend = configNode.getAPI();
      const deviceId: string = msg.payload?.deviceId ?? config.deviceId;

      try {
        if (msg.payload?.name !== undefined) {
          const name: string = msg.payload.name;
          await api.renameDevice(deviceId, name);
          this.status({ fill: 'green', shape: 'dot', text: `renamed: ${name}` });
          msg.payload = { deviceId, name };
        } else {
          const devices = await api.getDevices();
          const device = devices.find(d => String(d.id) === deviceId);
          const nonLockableProduct = device ? NON_LOCKABLE_PRODUCTS[device.product_id] : undefined;
          if (nonLockableProduct !== undefined) {
            const message = `Device ${deviceId} (${device!.name}) is a ${nonLockableProduct} and does not support lock control`;
            this.status({ fill: 'red', shape: 'ring', text: `${nonLockableProduct}: no lock control` });
            this.error(message, msg);
            return;
          }

          const lockState: LockState = msg.payload?.lockState ?? config.lockState;
          await api.setLockState(deviceId, lockState);
          const label = LOCK_STATE_LABELS[Number(lockState) as LockState] ?? 'unknown';
          this.status({ fill: 'green', shape: 'dot', text: `lock: ${lockState} (${label})` });
          msg.payload = { deviceId, lockState };
        }
        this.send(msg);
      } catch (err: any) {
        this.status({ fill: 'red', shape: 'ring', text: err.message });
        this.error(err.message, msg);
      }
    });

    this.status({ fill: 'yellow', shape: 'ring', text: 'idle' });
  }

  RED.nodes.registerType('surepetcare-control', SurepetcareControlNode);
};
