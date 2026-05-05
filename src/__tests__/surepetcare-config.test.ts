import helper from 'node-red-node-test-helper';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surepetcareConfig = require('../nodes/surepetcare-config/surepetcare-config');

helper.init(require.resolve('node-red'));

describe('surepetcare-config node', () => {
  beforeEach(async () => { await helper.startServer(); });
  afterEach(async () => {
    await helper.unload();
    await new Promise<void>(resolve => helper.stopServer(resolve));
  });

  it('should be registered as a config node', async () => {
    const flow = [
      {
        id: 'cfg1',
        type: 'surepetcare-config',
        name: 'My Flap',
        credentials: { email: 'test@example.com', password: 'secret' },
      },
    ];
    await helper.load(surepetcareConfig, flow);
    const cfg = helper.getNode('cfg1');
    expect(cfg).toBeTruthy();
    expect(cfg.name).toBe('My Flap');
  });

  it('should expose a getAPI() method', async () => {
    const flow = [
      {
        id: 'cfg1',
        type: 'surepetcare-config',
        credentials: { email: 'test@example.com', password: 'secret' },
      },
    ];
    await helper.load(surepetcareConfig, flow);
    const cfg = helper.getNode('cfg1') as any;
    expect(typeof cfg.getAPI).toBe('function');
  });

  it('getAPI() returns a SurepetcareAPI instance', async () => {
    const flow = [
      {
        id: 'cfg1',
        type: 'surepetcare-config',
        credentials: { email: 'test@example.com', password: 'secret' },
      },
    ];
    await helper.load(surepetcareConfig, flow);
    const cfg = helper.getNode('cfg1') as any;
    const api = cfg.getAPI();
    expect(typeof api.authenticate).toBe('function');
    expect(typeof api.getPets).toBe('function');
    expect(typeof api.setLockState).toBe('function');
  });
});
