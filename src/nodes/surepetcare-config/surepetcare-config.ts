import { randomUUID } from 'crypto';
import { NodeAPI, NodeDef } from 'node-red';
import { SurepetcareAPI } from '../../lib/surepetcare-api';

interface SurepetcareConfigNodeDef extends NodeDef {
  name: string;
}

export = function (RED: NodeAPI) {
  (RED as any).httpAdmin.get(
    '/surepetcare/devices',
    (RED as any).auth.needsPermission('surepetcare-config.read'),
    async (req: any, res: any) => {
      const configNode = RED.nodes.getNode(req.query.id as string) as any;
      if (!configNode || typeof configNode.getAPI !== 'function') {
        res.status(404).json({ error: 'Config node not found — deploy the flow first' });
        return;
      }
      try {
        const devices = await configNode.getAPI().getDevices();
        res.json(devices);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  function SurepetcareConfigNode(this: any, config: SurepetcareConfigNodeDef) {
    RED.nodes.createNode(this, config);

    const creds = (this.credentials || {}) as {
      email?: string;
      password?: string;
      deviceId?: string;
    };

    if (!creds.deviceId) {
      creds.deviceId = randomUUID();
    }

    const api = new SurepetcareAPI({
      email: creds.email || '',
      password: creds.password || '',
      deviceId: creds.deviceId,
    });

    this.getAPI = () => api;
  }

  RED.nodes.registerType('surepetcare-config', SurepetcareConfigNode, {
    credentials: {
      email: { type: 'text' },
      password: { type: 'password' },
      deviceId: { type: 'text' },
    },
  });
};
