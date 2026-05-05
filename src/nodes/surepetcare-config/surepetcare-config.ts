import { randomUUID } from 'crypto';
import { NodeAPI, NodeDef } from 'node-red';
import { SurepetcareAPI } from '../../lib/surepetcare-api';

interface SurepetcareConfigNodeDef extends NodeDef {
  name: string;
}

export = function (RED: NodeAPI) {
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
