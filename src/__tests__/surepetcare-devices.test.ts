import helper from 'node-red-node-test-helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareConfig = require('../nodes/surepetcare-config/surepetcare-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareDevices = require('../nodes/surepetcare-devices/surepetcare-devices');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SurepetcareAPI } = require('../lib/surepetcare-api');
import { SurepetcareBackend } from '../types/surepetcare';

helper.init(require.resolve('node-red'));

function makeFlow() {
  return [
    {
      id: 'cfg1',
      type: 'surepetcare-config',
      credentials: { email: 'test@example.com', password: 'secret' },
    },
    {
      id: 'n1',
      type: 'surepetcare-devices',
      name: 'My Devices',
      config: 'cfg1',
      pollInterval: 0, // 0 * 1000 = 0ms -> no timer
      wires: [['n2']],
    },
    { id: 'n2', type: 'helper' },
  ];
}

const mockAPI: SurepetcareBackend = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  getPets: jest.fn().mockResolvedValue([]),
  setLockState: jest.fn().mockResolvedValue(undefined),
  renameDevice: jest.fn().mockResolvedValue(undefined),
  getDevices: jest.fn().mockResolvedValue([
    {
      id: 10,
      name: 'Front Door Flap',
      serial_number: 'H008-0123456',
      product_id: 6,
      household_id: 100,
      status: { locking: { mode: -1 } },
      control: { curfew: [{ lock_time: '20:00', unlock_time: '07:00', enabled: true }] },
    },
    {
      id: 11,
      name: 'Back Door Flap',
      serial_number: 'H008-0123457',
      product_id: 6,
      household_id: 100,
      status: { locking: { mode: 0 } },
      control: { curfew: [] },
    },
  ]),
};

describe('surepetcare-devices node', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await helper.startServer();
  });

  afterEach(async () => {
    await helper.unload();
    await new Promise<void>(resolve => helper.stopServer(resolve));
  });

  it('should be loaded', async () => {
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const n1 = helper.getNode('n1');
    expect(n1).toBeTruthy();
    expect(n1.type).toBe('surepetcare-devices');
  });

  it('should emit one message per device on poll, including curfew and locking mode', async () => {
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const messages: any[] = [];
    const done = new Promise<void>(resolve => {
      n2.on('input', (msg: any) => {
        messages.push(msg);
        if (messages.length === 2) resolve();
      });
    });

    await n1.poll();
    await done;

    expect(messages[0].payload).toMatchObject({
      deviceId: '10',
      name: 'Front Door Flap',
      lockingMode: -1,
      curfew: [{ lock_time: '20:00', unlock_time: '07:00', enabled: true }],
    });
    expect(messages[1].payload).toMatchObject({
      deviceId: '11',
      name: 'Back Door Flap',
      lockingMode: 0,
      curfew: [],
    });
  });

  it('should handle devices with no status/control data gracefully', async () => {
    const bareAPI = {
      ...mockAPI,
      getDevices: jest.fn().mockResolvedValue([
        { id: 12, name: 'Old Firmware Flap', serial_number: 'H008-9999', product_id: 6, household_id: 100 },
      ]),
    };
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => bareAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    await n1.poll();
    const msg = await msgReceived;

    expect(msg.payload).toMatchObject({ deviceId: '12', name: 'Old Firmware Flap' });
    expect(msg.payload.lockingMode).toBeUndefined();
    expect(msg.payload.curfew).toBeUndefined();
  });

  it('should set status to green with a device count and curfew-locked summary', async () => {
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: '2 devices (1 curfew locked)' });
  });

  it('should show no curfew note in status when no device is curfew-locked', async () => {
    const noCurfewAPI = {
      ...mockAPI,
      getDevices: jest.fn().mockResolvedValue([
        { id: 10, name: 'Front Door Flap', serial_number: 'H008-1', product_id: 6, household_id: 1, status: { locking: { mode: 0 } } },
        { id: 11, name: 'Back Door Flap', serial_number: 'H008-2', product_id: 6, household_id: 1, status: { locking: { mode: 3 } } },
      ]),
    };
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => noCurfewAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: '2 devices' });
  });

  it('should show the single device\'s lock label in status when there is only one device', async () => {
    const singleDeviceAPI = {
      ...mockAPI,
      getDevices: jest.fn().mockResolvedValue([
        { id: 10, name: 'Front Door Flap', serial_number: 'H008-1', product_id: 6, household_id: 1, status: { locking: { mode: -1 } } },
      ]),
    };
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => singleDeviceAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: 'Front Door Flap: curfew locked' });
  });

  it('should show a "no devices" status when the household has none', async () => {
    const emptyAPI = { ...mockAPI, getDevices: jest.fn().mockResolvedValue([]) };
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => emptyAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: 'no devices' });
  });

  it('should set status to red and emit node.error on API failure', async () => {
    const failingAPI = { ...mockAPI, getDevices: jest.fn().mockRejectedValue(new Error('Network failure')) };
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => failingAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });

  it('should trigger poll when input message received', async () => {
    await helper.load([surepetcareConfig, surepetcareDevices], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');
    const n1 = helper.getNode('n1');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    n1.receive({});
    await msgReceived;
  });

  it('should poll immediately on startup when pollInterval > 0', async () => {
    jest.spyOn(SurepetcareAPI.prototype, 'authenticate').mockResolvedValue(undefined);
    jest.spyOn(SurepetcareAPI.prototype, 'getDevices').mockResolvedValue([]);

    const flow = [
      { id: 'cfg1', type: 'surepetcare-config', credentials: { email: 'test@example.com', password: 'secret' } },
      { id: 'n1', type: 'surepetcare-devices', config: 'cfg1', pollInterval: 3600, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];

    await helper.load([surepetcareConfig, surepetcareDevices], flow);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(SurepetcareAPI.prototype.getDevices).toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
