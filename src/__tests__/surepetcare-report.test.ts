import helper from 'node-red-node-test-helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareConfig = require('../nodes/surepetcare-config/surepetcare-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareReport = require('../nodes/surepetcare-report/surepetcare-report');
import { SurepetcareBackend } from '../types/surepetcare';

helper.init(require.resolve('node-red'));

const REPORT_WITH_MOVEMENT = {
  movement: {
    datapoints: [
      { from: '2026-09-06T16:05:21+00:00', to: '2026-09-06T23:12:45+00:00', duration: 25644 },
      { from: '2026-09-07T05:40:11+00:00', to: '2026-09-08T04:42:38+00:00', duration: 82947 },
    ],
  },
  feeding: { datapoints: [] },
  drinking: { datapoints: [] },
};

const mockAPI: SurepetcareBackend = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  getPets: jest.fn().mockResolvedValue([]),
  setLockState: jest.fn().mockResolvedValue(undefined),
  renameDevice: jest.fn().mockResolvedValue(undefined),
  getDevices: jest.fn().mockResolvedValue([]),
  getPetReport: jest.fn().mockResolvedValue(REPORT_WITH_MOVEMENT),
};

function makeFlow(petId = '770878') {
  return [
    {
      id: 'cfg1',
      type: 'surepetcare-config',
      credentials: { email: 'test@example.com', password: 'secret' },
    },
    {
      id: 'n1',
      type: 'surepetcare-report',
      name: 'Pet Report',
      config: 'cfg1',
      petId,
      wires: [['n2']],
    },
    { id: 'n2', type: 'helper' },
  ];
}

describe('surepetcare-report node', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await helper.startServer();
  });

  afterEach(async () => {
    await helper.unload();
    await new Promise<void>(resolve => helper.stopServer(resolve));
  });

  it('should be loaded', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow());
    const n1 = helper.getNode('n1');
    expect(n1).toBeTruthy();
    expect(n1.type).toBe('surepetcare-report');
  });

  it('should call getPetReport with the node-configured petId on input', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: {} });
    const msg = await msgReceived;

    expect(mockAPI.getPetReport).toHaveBeenCalledWith('770878', undefined, undefined);
    expect(msg.payload).toMatchObject({ petId: '770878', report: REPORT_WITH_MOVEMENT });
  });

  it('should use msg.payload.petId to override node config', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    helper.getNode('n1').receive({ payload: { petId: '999' } });
    await msgReceived;

    expect(mockAPI.getPetReport).toHaveBeenCalledWith('999', undefined, undefined);
  });

  it('should pass fromDate/toDate from msg.payload', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: { fromDate: '2026-09-01', toDate: '2026-09-12' } });
    const msg = await msgReceived;

    expect(mockAPI.getPetReport).toHaveBeenCalledWith('770878', '2026-09-01', '2026-09-12');
    expect(msg.payload).toMatchObject({ fromDate: '2026-09-01', toDate: '2026-09-12' });
  });

  it('should error without calling the API when fromDate is given without toDate', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;

    n1.receive({ payload: { fromDate: '2026-09-01' } });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockAPI.getPetReport).not.toHaveBeenCalled();
    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });

  it('should error without calling the API when no petId is available', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow(''));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;

    n1.receive({ payload: {} });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockAPI.getPetReport).not.toHaveBeenCalled();
    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });

  it('should summarize total outside hours in status when the report has movement datapoints', async () => {
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    n1.receive({ payload: {} });
    await msgReceived;

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: '2 periods, 30.2h outside' });
  });

  it('should use the singular "period" and treat a missing duration as zero', async () => {
    const singlePeriodAPI = {
      ...mockAPI,
      getPetReport: jest.fn().mockResolvedValue({ movement: { datapoints: [{ from: 'x', to: 'y' }] } }),
    };
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => singlePeriodAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    n1.receive({ payload: {} });
    await msgReceived;

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: '1 period, 0.0h outside' });
  });

  it('should fall back to a generic status when the report has no recognisable movement data', async () => {
    const noMovementAPI = { ...mockAPI, getPetReport: jest.fn().mockResolvedValue({ unexpected: true }) };
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => noMovementAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    n1.receive({ payload: {} });
    await msgReceived;

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: 'report received' });
  });

  it('should set status red and call node.error on API failure', async () => {
    const failingAPI = { ...mockAPI, getPetReport: jest.fn().mockRejectedValue(new Error('API down')) };
    await helper.load([surepetcareConfig, surepetcareReport], makeFlow('770878'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => failingAPI;
    const n1 = helper.getNode('n1') as any;

    n1.receive({ payload: {} });
    await new Promise(resolve => setTimeout(resolve, 50));

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });
});
