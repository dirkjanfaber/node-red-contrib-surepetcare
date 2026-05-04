import helper from 'node-red-node-test-helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sureflapConfig = require('../nodes/sureflap-config/sureflap-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sureflapControl = require('../nodes/sureflap-control/sureflap-control');
import { SurepetcareBackend } from '../types/sureflap';

helper.init(require.resolve('node-red'));

const mockAPI: SurepetcareBackend = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  getPets: jest.fn().mockResolvedValue([]),
  setLockState: jest.fn().mockResolvedValue(undefined),
  getDevices: jest.fn().mockResolvedValue([
    { id: 10, name: 'Front Door', serial_number: 'H008-0001', product_id: 6, household_id: 1 },
  ]),
};

function makeFlow(deviceId = '10', lockState: number | undefined = undefined) {
  return [
    {
      id: 'cfg1',
      type: 'surepetcare-config',
      credentials: { email: 'test@example.com', password: 'secret' },
    },
    {
      id: 'n1',
      type: 'surepetcare-control',
      name: 'Control Flap',
      config: 'cfg1',
      deviceId,
      lockState,
      wires: [['n2']],
    },
    { id: 'n2', type: 'helper' },
  ];
}

describe('surepetcare-control node', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await helper.startServer();
  });

  afterEach(async () => {
    await helper.unload();
    await new Promise<void>(resolve => helper.stopServer(resolve));
  });

  it('should be loaded', async () => {
    await helper.load([sureflapConfig, sureflapControl], makeFlow());
    const n1 = helper.getNode('n1');
    expect(n1).toBeTruthy();
    expect(n1.type).toBe('surepetcare-control');
  });

  it('should call setLockState with node-configured lockState on input', async () => {
    await helper.load([sureflapConfig, sureflapControl], makeFlow('10', 3));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: {} });
    const msg = await msgReceived;

    expect(mockAPI.setLockState).toHaveBeenCalledWith('10', 3);
    expect(msg.payload).toMatchObject({ deviceId: '10', lockState: 3 });
  });

  it('should use msg.payload.lockState to override node config', async () => {
    await helper.load([sureflapConfig, sureflapControl], makeFlow('10', 0));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: { lockState: 2 } });
    const msg = await msgReceived;

    expect(mockAPI.setLockState).toHaveBeenCalledWith('10', 2);
    expect(msg.payload.lockState).toBe(2);
  });

  it('should use msg.payload.deviceId to override node config', async () => {
    await helper.load([sureflapConfig, sureflapControl], makeFlow('10', 1));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    helper.getNode('n1').receive({ payload: { deviceId: '99' } });
    await msgReceived;

    expect(mockAPI.setLockState).toHaveBeenCalledWith('99', 1);
  });

  it('should set status green on success', async () => {
    await helper.load([sureflapConfig, sureflapControl], makeFlow('10', 0));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    n1.receive({ payload: {} });
    await msgReceived;

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green' });
  });

  it('should set status red and call node.error on failure', async () => {
    const failingAPI = { ...mockAPI, setLockState: jest.fn().mockRejectedValue(new Error('API down')) };
    await helper.load([sureflapConfig, sureflapControl], makeFlow('10', 0));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => failingAPI;
    const n1 = helper.getNode('n1') as any;

    // Trigger and wait for the async handler to settle
    n1.receive({ payload: {} });
    await new Promise(resolve => setTimeout(resolve, 50));

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });
});
