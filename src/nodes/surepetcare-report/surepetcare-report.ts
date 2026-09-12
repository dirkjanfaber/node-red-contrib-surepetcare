import { NodeAPI, NodeDef } from 'node-red';
import { SurepetcareBackend } from '../../types/surepetcare';

interface SurepetcareReportNodeDef extends NodeDef {
  config: string;
  petId: string;
}

interface MovementDatapoint {
  duration?: number;
}

function summarizeReport(report: unknown): string {
  const datapoints = (report as { movement?: { datapoints?: MovementDatapoint[] } } | undefined)?.movement
    ?.datapoints;
  if (!Array.isArray(datapoints)) {
    return 'report received';
  }
  const totalSeconds = datapoints.reduce((sum, dp) => sum + (dp.duration ?? 0), 0);
  const hours = (totalSeconds / 3600).toFixed(1);
  return `${datapoints.length} period${datapoints.length === 1 ? '' : 's'}, ${hours}h outside`;
}

export = function (RED: NodeAPI) {
  function SurepetcareReportNode(this: any, config: SurepetcareReportNodeDef) {
    RED.nodes.createNode(this, config);

    const configNode = RED.nodes.getNode(config.config) as any;

    this.on('input', async (msg: any) => {
      const api: SurepetcareBackend = configNode.getAPI();
      const petId: string = msg.payload?.petId ?? config.petId;
      const fromDate: string | undefined = msg.payload?.fromDate;
      const toDate: string | undefined = msg.payload?.toDate;

      if (!petId) {
        const err = 'petId is required (set it on the node or via msg.payload.petId)';
        this.status({ fill: 'red', shape: 'ring', text: err });
        this.error(err, msg);
        return;
      }

      if ((fromDate === undefined) !== (toDate === undefined)) {
        const err = 'fromDate and toDate must both be given, or neither';
        this.status({ fill: 'red', shape: 'ring', text: err });
        this.error(err, msg);
        return;
      }

      try {
        const report = await api.getPetReport(petId, fromDate, toDate);
        msg.payload = { petId, fromDate, toDate, report };
        this.status({ fill: 'green', shape: 'dot', text: summarizeReport(report) });
        this.send(msg);
      } catch (err: any) {
        this.status({ fill: 'red', shape: 'ring', text: err.message });
        this.error(err.message, msg);
      }
    });

    this.status({ fill: 'yellow', shape: 'ring', text: 'idle' });
  }

  RED.nodes.registerType('surepetcare-report', SurepetcareReportNode);
};
