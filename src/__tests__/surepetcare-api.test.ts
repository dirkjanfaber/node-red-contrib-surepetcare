import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { SurepetcareAPI } from '../lib/surepetcare-api';

const BASE_URL = 'https://app.api.surehub.io/api';

const MOCK_TOKEN = 'mock-token-abc123';

const MOCK_PETS_RESPONSE = {
  data: [
    { id: 1, name: 'Whiskers', position: { where: 1, since: '2024-01-01T10:00:00Z' } },
    { id: 2, name: 'Shadow', position: { where: 2, since: '2024-01-01T09:00:00Z' } },
  ],
};

const MOCK_DEVICES_RESPONSE = {
  data: [
    { id: 10, name: 'Front Door Flap', serial_number: 'H008-0123456', product_id: 6, household_id: 100 },
  ],
};

describe('SurepetcareAPI', () => {
  let mock: MockAdapter;
  let api: SurepetcareAPI;

  beforeEach(() => {
    mock = new MockAdapter(axios);
    api = new SurepetcareAPI({
      email: 'test@example.com',
      password: 'secret',
      deviceId: 'test-device-uuid',
    });
  });

  afterEach(() => {
    mock.restore();
  });

  // --- authenticate ---

  describe('authenticate()', () => {
    it('posts credentials and stores the token', async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });

      await api.authenticate();

      expect(mock.history.post).toHaveLength(1);
      const body = JSON.parse(mock.history.post[0].data);
      expect(body.email_address).toBe('test@example.com');
      expect(body.password).toBe('secret');
      expect(body.device_id).toBe('test-device-uuid');
    });

    it('does not re-authenticate within 24h', async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });

      await api.authenticate();
      await api.authenticate();

      expect(mock.history.post).toHaveLength(1);
    });

    it('re-authenticates after 24h', async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });

      await api.authenticate();
      // Force token to appear stale
      (api as any).tokenExpiresAt = Date.now() - 1000;
      await api.authenticate();

      expect(mock.history.post).toHaveLength(2);
    });

    it('throws on invalid credentials (401)', async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(401, { error: 'Unauthorized' });

      await expect(api.authenticate()).rejects.toThrow();
    });
  });

  // --- getPets ---

  describe('getPets()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      await api.authenticate();
    });

    it('returns an array of pets with positions', async () => {
      mock.onGet(`${BASE_URL}/pet`).reply(200, MOCK_PETS_RESPONSE);

      const pets = await api.getPets();

      expect(pets).toHaveLength(2);
      expect(pets[0]).toEqual({ id: 1, name: 'Whiskers', position: { where: 1, since: '2024-01-01T10:00:00Z' } });
      expect(pets[1].position.where).toBe(2);
    });

    it('sends Bearer token in the Authorization header', async () => {
      mock.onGet(`${BASE_URL}/pet`).reply(200, MOCK_PETS_RESPONSE);

      await api.getPets();

      expect(mock.history.get[0].headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
    });

    it('re-authenticates and retries on 401', async () => {
      mock
        .onGet(`${BASE_URL}/pet`)
        .replyOnce(401)
        .onGet(`${BASE_URL}/pet`)
        .reply(200, MOCK_PETS_RESPONSE);

      const pets = await api.getPets();

      expect(pets).toHaveLength(2);
      expect(mock.history.post).toHaveLength(2); // initial auth + re-auth
    });

    it('throws after two consecutive 401 responses', async () => {
      mock.onGet(`${BASE_URL}/pet`).reply(401);

      await expect(api.getPets()).rejects.toThrow();
    });

    it('throws on 429 rate limit', async () => {
      mock.onGet(`${BASE_URL}/pet`).reply(429);

      await expect(api.getPets()).rejects.toThrow(/rate limit/i);
    });

    it('throws on network error', async () => {
      mock.onGet(`${BASE_URL}/pet`).networkError();

      await expect(api.getPets()).rejects.toThrow();
    });
  });

  // --- getDevices ---

  describe('getDevices()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      await api.authenticate();
    });

    it('returns an array of devices', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, MOCK_DEVICES_RESPONSE);

      const devices = await api.getDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].serial_number).toBe('H008-0123456');
    });

    it('sends Bearer token in the Authorization header', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, MOCK_DEVICES_RESPONSE);

      await api.getDevices();

      expect(mock.history.get[0].headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
    });

    it('re-authenticates and retries on 401', async () => {
      mock
        .onGet(`${BASE_URL}/device`)
        .replyOnce(401)
        .onGet(`${BASE_URL}/device`)
        .reply(200, MOCK_DEVICES_RESPONSE);

      const devices = await api.getDevices();

      expect(devices).toHaveLength(1);
      expect(mock.history.post).toHaveLength(2);
    });
  });

  // --- renameDevice ---

  describe('renameDevice()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      await api.authenticate();
    });

    it('sends PUT with the correct name', async () => {
      mock.onPut(`${BASE_URL}/device/10`).reply(200, { data: {} });

      await api.renameDevice('10', 'the Gates of Valhalla');

      const body = JSON.parse(mock.history.put[0].data);
      expect(body.name).toBe('the Gates of Valhalla');
    });

    it('sends Bearer token in the Authorization header', async () => {
      mock.onPut(`${BASE_URL}/device/10`).reply(200, { data: {} });

      await api.renameDevice('10', 'the Twilight Zone');

      expect(mock.history.put[0].headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
    });

    it('re-authenticates and retries on 401', async () => {
      mock
        .onPut(`${BASE_URL}/device/10`)
        .replyOnce(401)
        .onPut(`${BASE_URL}/device/10`)
        .reply(200, { data: {} });

      await api.renameDevice('10', 'the Bifrost');

      expect(mock.history.post).toHaveLength(2);
    });

    it('throws on network error', async () => {
      mock.onPut(`${BASE_URL}/device/10`).networkError();

      await expect(api.renameDevice('10', 'the Bifrost')).rejects.toThrow();
    });
  });

  // --- setLockState ---

  describe('setLockState()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      await api.authenticate();
    });

    it('sends PUT with the correct locking value', async () => {
      mock.onPut(`${BASE_URL}/device/10/control`).reply(200, { data: {} });

      await api.setLockState('10', 3);

      const body = JSON.parse(mock.history.put[0].data);
      expect(body.locking).toBe(3);
    });

    it('accepts all four lock state values', async () => {
      for (const state of [0, 1, 2, 3] as const) {
        mock.onPut(`${BASE_URL}/device/10/control`).reply(200, { data: {} });
        await api.setLockState('10', state);
      }
      expect(mock.history.put).toHaveLength(4);
    });

    it('sends Bearer token in the Authorization header', async () => {
      mock.onPut(`${BASE_URL}/device/10/control`).reply(200, { data: {} });

      await api.setLockState('10', 0);

      expect(mock.history.put[0].headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
    });

    it('re-authenticates and retries on 401', async () => {
      mock
        .onPut(`${BASE_URL}/device/10/control`)
        .replyOnce(401)
        .onPut(`${BASE_URL}/device/10/control`)
        .reply(200, { data: {} });

      await api.setLockState('10', 0);

      expect(mock.history.post).toHaveLength(2);
    });

    it('throws on network error', async () => {
      mock.onPut(`${BASE_URL}/device/10/control`).networkError();

      await expect(api.setLockState('10', 0)).rejects.toThrow();
    });
  });
});
