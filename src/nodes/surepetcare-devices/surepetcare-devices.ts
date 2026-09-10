import { NodeAPI, NodeDef } from 'node-red';
import { DeviceLockingMode, SurepetcareBackend } from '../../types/surepetcare';

interface SurepetcareDevicesNodeDef extends NodeDef {
  config: string;
  pollInterval: number;
}

const LOCKING_MODE_LABELS: Record<number, string> = {
  0: 'unlocked',
  1: 'locked in',
  2: 'locked out',
  3: 'locked both ways',
  4: 'curfew scheduled',
  [-1]: 'curfew locked',
  [-2]: 'curfew unlocked',
  [-3]: 'curfew unknown',
};

function lockingModeLabel(mode: DeviceLockingMode | undefined): string {
  if (mode === undefined) return 'no status reported';
  return LOCKING_MODE_LABELS[mode] ?? `mode ${mode}`;
}

export = function (RED: NodeAPI) {
  function SurepetcareDevicesNode(this: any, config: SurepetcareDevicesNodeDef) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.config) as any;
    const intervalMs = (config.pollInterval ?? 60) * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;

    this.poll = async () => {
      const api: SurepetcareBackend = configNode.getAPI();
      try {
        const devices = await api.getDevices();
        for (const device of devices) {
          this.send({
            payload: {
              deviceId: String(device.id),
              name: device.name,
              lockingMode: device.status?.locking?.mode,
              curfew: device.control?.curfew,
            },
          });
        }

        let summary: string;
        if (devices.length === 0) {
          summary = 'no devices';
        } else if (devices.length === 1) {
          summary = `${devices[0].name}: ${lockingModeLabel(devices[0].status?.locking?.mode)}`;
        } else {
          const curfewLocked = devices.filter(d => d.status?.locking?.mode === -1).length;
          summary = `${devices.length} devices${curfewLocked > 0 ? ` (${curfewLocked} curfew locked)` : ''}`;
        }
        this.status({ fill: 'green', shape: 'dot', text: summary });
      } catch (err: any) {
        this.status({ fill: 'red', shape: 'ring', text: err.message });
        this.error(err.message);
      }
    };

    this.on('input', () => this.poll());

    if (intervalMs > 0) {
      this.poll();
      timer = setInterval(() => this.poll(), intervalMs);
    }

    this.on('close', () => {
      if (timer) clearInterval(timer);
    });

    this.status({ fill: 'yellow', shape: 'ring', text: 'idle' });
  }

  RED.nodes.registerType('surepetcare-devices', SurepetcareDevicesNode);
};
