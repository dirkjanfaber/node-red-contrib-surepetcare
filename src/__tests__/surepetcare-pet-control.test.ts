import helper from 'node-red-node-test-helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareConfig = require('../nodes/surepetcare-config/surepetcare-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcarePetControl = require('../nodes/surepetcare-pet-control/surepetcare-pet-control');
import { SurepetcareBackend } from '../types/surepetcare';

helper.init(require.resolve('node-red'));

const mockAPI: SurepetcareBackend = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  getPets: jest.fn().mockResolvedValue([{ id: 5, name: 'Whiskers', position: { where: 2 } }]),
  setLockState: jest.fn().mockResolvedValue(undefined),
  renameDevice: jest.fn().mockResolvedValue(undefined),
  getDevices: jest.fn().mockResolvedValue([]),
  getPetReport: jest.fn().mockResolvedValue({}),
  setPetLocation: jest.fn().mockResolvedValue(undefined),
};

function makeFlow(petId = '5', location: string | undefined = undefined) {
  return [
    {
      id: 'cfg1',
      type: 'surepetcare-config',
      credentials: { email: 'test@example.com', password: 'secret' },
    },
    {
      id: 'n1',
      type: 'surepetcare-pet-control',
      name: 'Set Pet Location',
      config: 'cfg1',
      petId,
      location,
      wires: [['n2']],
    },
    { id: 'n2', type: 'helper' },
  ];
}

describe('surepetcare-pet-control node', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await helper.startServer();
  });

  afterEach(async () => {
    await helper.unload();
    await new Promise<void>(resolve => helper.stopServer(resolve));
  });

  it('should be loaded', async () => {
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow());
    const n1 = helper.getNode('n1');
    expect(n1).toBeTruthy();
    expect(n1.type).toBe('surepetcare-pet-control');
  });

  it('should call setPetLocation with where=1 for the node-configured "inside" location', async () => {
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow('5', 'inside'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: {} });
    const msg = await msgReceived;

    expect(mockAPI.setPetLocation).toHaveBeenCalledWith('5', 1);
    expect(msg.payload).toMatchObject({ petId: '5', location: 'inside', where: 1 });
  });

  it('should call setPetLocation with where=2 for the node-configured "outside" location', async () => {
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow('5', 'outside'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: {} });
    const msg = await msgReceived;

    expect(mockAPI.setPetLocation).toHaveBeenCalledWith('5', 2);
    expect(msg.payload).toMatchObject({ petId: '5', location: 'outside', where: 2 });
  });

  it('should use msg.payload.location to override node config', async () => {
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow('5', 'inside'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<any>(resolve => n2.on('input', resolve));
    helper.getNode('n1').receive({ payload: { location: 'outside' } });
    const msg = await msgReceived;

    expect(mockAPI.setPetLocation).toHaveBeenCalledWith('5', 2);
    expect(msg.payload.location).toBe('outside');
  });

  it('should use msg.payload.petId to override node config', async () => {
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow('5', 'inside'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    helper.getNode('n1').receive({ payload: { petId: '99' } });
    await msgReceived;

    expect(mockAPI.setPetLocation).toHaveBeenCalledWith('99', 1);
  });

  it('should set status green with pet name and location on success', async () => {
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow('5', 'inside'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;
    const n2 = helper.getNode('n2');

    const msgReceived = new Promise<void>(resolve => n2.on('input', () => resolve()));
    n1.receive({ payload: {} });
    await msgReceived;

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green', text: 'Whiskers: inside' });
  });

  it('should set status red and call node.error on failure', async () => {
    const failingAPI = { ...mockAPI, setPetLocation: jest.fn().mockRejectedValue(new Error('API down')) };
    await helper.load([surepetcareConfig, surepetcarePetControl], makeFlow('5', 'inside'));
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => failingAPI;
    const n1 = helper.getNode('n1') as any;

    n1.receive({ payload: {} });
    await new Promise(resolve => setTimeout(resolve, 50));

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });
});
