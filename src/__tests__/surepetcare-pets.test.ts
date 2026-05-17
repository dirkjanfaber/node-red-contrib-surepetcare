import helper from 'node-red-node-test-helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareConfig = require('../nodes/surepetcare-config/surepetcare-config');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcarePets = require('../nodes/surepetcare-pets/surepetcare-pets');
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
      type: 'surepetcare-pets',
      name: 'My Pets',
      config: 'cfg1',
      pollInterval: 0, // 0 * 1000 = 0ms -> no timer
      wires: [['n2']],
    },
    { id: 'n2', type: 'helper' },
  ];
}

const mockAPI: SurepetcareBackend = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  getPets: jest.fn().mockResolvedValue([
    { id: 1, name: 'Whiskers', position: { where: 1 } },
    { id: 2, name: 'Shadow', position: { where: 2 } },
  ]),
  setLockState: jest.fn().mockResolvedValue(undefined),
  renameDevice: jest.fn().mockResolvedValue(undefined),
  getDevices: jest.fn().mockResolvedValue([]),
};

describe('surepetcare-pets node', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await helper.startServer();
  });

  afterEach(async () => {
    await helper.unload();
    await new Promise<void>(resolve => helper.stopServer(resolve));
  });

  it('should be loaded', async () => {
    await helper.load([surepetcareConfig, surepetcarePets], makeFlow());
    const n1 = helper.getNode('n1');
    expect(n1).toBeTruthy();
    expect(n1.type).toBe('surepetcare-pets');
  });

  it('should emit one message per pet on poll', async () => {
    await helper.load([surepetcareConfig, surepetcarePets], makeFlow());
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

    expect(messages[0].payload.name).toBe('Whiskers');
    expect(messages[0].payload.location).toBe('inside');
    expect(messages[1].payload.name).toBe('Shadow');
    expect(messages[1].payload.location).toBe('outside');
  });

  it('should set status to green on successful poll', async () => {
    await helper.load([surepetcareConfig, surepetcarePets], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => mockAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'green' });
  });

  it('should set status to red and emit node.error on API failure', async () => {
    const failingAPI = { ...mockAPI, getPets: jest.fn().mockRejectedValue(new Error('Network failure')) };
    await helper.load([surepetcareConfig, surepetcarePets], makeFlow());
    const cfg = helper.getNode('cfg1') as any;
    cfg.getAPI = () => failingAPI;
    const n1 = helper.getNode('n1') as any;

    await n1.poll();

    const lastArg = (n1.status as any).lastCall?.args[0];
    expect(lastArg).toMatchObject({ fill: 'red' });
  });

  it('should trigger poll when input message received', async () => {
    await helper.load([surepetcareConfig, surepetcarePets], makeFlow());
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
    jest.spyOn(SurepetcareAPI.prototype, 'getPets').mockResolvedValue([]);

    const flow = [
      { id: 'cfg1', type: 'surepetcare-config', credentials: { email: 'test@example.com', password: 'secret' } },
      { id: 'n1', type: 'surepetcare-pets', config: 'cfg1', pollInterval: 3600, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];

    await helper.load([surepetcareConfig, surepetcarePets], flow);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(SurepetcareAPI.prototype.getPets).toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
