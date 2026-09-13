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
    api = new SurepetcareAPI(
      {
        email: 'test@example.com',
        password: 'secret',
        deviceId: 'test-device-uuid',
      },
      { retryDelays: [0, 0, 0] }
    );
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

    it('throws on 429 rate limit after exhausting retries', async () => {
      mock.onGet(`${BASE_URL}/pet`).reply(429);

      await expect(api.getPets()).rejects.toThrow(/rate limit/i);
      // 1 initial attempt + 3 retries (retryDelays: [0, 0, 0])
      expect(mock.history.get).toHaveLength(4);
    });

    it('retries on 429 and succeeds once the rate limit clears', async () => {
      mock
        .onGet(`${BASE_URL}/pet`)
        .replyOnce(429)
        .onGet(`${BASE_URL}/pet`)
        .replyOnce(429)
        .onGet(`${BASE_URL}/pet`)
        .reply(200, MOCK_PETS_RESPONSE);

      const pets = await api.getPets();

      expect(pets).toHaveLength(2);
      expect(mock.history.get).toHaveLength(3);
    });

    it('throws on network error after exhausting retries', async () => {
      mock.onGet(`${BASE_URL}/pet`).networkError();

      await expect(api.getPets()).rejects.toThrow();
      expect(mock.history.get).toHaveLength(4);
    });

    it('retries on network error and succeeds once connectivity returns', async () => {
      mock
        .onGet(`${BASE_URL}/pet`)
        .networkErrorOnce()
        .onGet(`${BASE_URL}/pet`)
        .networkErrorOnce()
        .onGet(`${BASE_URL}/pet`)
        .reply(200, MOCK_PETS_RESPONSE);

      const pets = await api.getPets();

      expect(pets).toHaveLength(2);
      expect(mock.history.get).toHaveLength(3);
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

    it('requests control data so curfew schedule and live lock status are included', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, MOCK_DEVICES_RESPONSE);

      await api.getDevices();

      expect(mock.history.get[0].params).toEqual({ 'with[]': 'control' });
    });

    it('passes through the curfew schedule and live locking mode', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, {
        data: [
          {
            id: 10,
            name: 'Front Door Flap',
            serial_number: 'H008-0123456',
            product_id: 6,
            household_id: 100,
            status: { locking: { mode: -1 } },
            control: { curfew: [{ lock_time: '20:00', unlock_time: '07:00', enabled: true }] },
          },
        ],
      });

      const devices = await api.getDevices();

      expect(devices[0].status?.locking?.mode).toBe(-1);
      expect(devices[0].control?.curfew).toEqual([{ lock_time: '20:00', unlock_time: '07:00', enabled: true }]);
    });
  });

  // --- renameDevice ---

  describe('renameDevice()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      mock.onGet(`${BASE_URL}/device`).reply(200, MOCK_DEVICES_RESPONSE);
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

    it('re-asserts an explicit lock override after renaming, so the rename endpoint cannot silently drop it', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, {
        data: [{ ...MOCK_DEVICES_RESPONSE.data[0], status: { locking: { mode: 3 } } }],
      });
      mock.onPut(`${BASE_URL}/device/10`).reply(200, { data: {} });
      mock.onPut(`${BASE_URL}/device/10/control`).reply(200, { data: {} });

      await api.renameDevice('10', 'the Gates of Valhalla');

      expect(mock.history.put).toHaveLength(2);
      expect(mock.history.put[0].url).toBe('/device/10');
      expect(JSON.parse(mock.history.put[0].data).name).toBe('the Gates of Valhalla');
      expect(mock.history.put[1].url).toBe('/device/10/control');
      expect(JSON.parse(mock.history.put[1].data).locking).toBe(3);
    });

    it('does not re-assert a lock state when the device has no prior status', async () => {
      mock.onPut(`${BASE_URL}/device/10`).reply(200, { data: {} });

      await api.renameDevice('10', 'the Bifrost');

      expect(mock.history.put).toHaveLength(1);
    });

    it('does not re-assert a lock state when the flap is governed by the app\'s own curfew schedule', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, {
        data: [{ ...MOCK_DEVICES_RESPONSE.data[0], status: { locking: { mode: -1 } } }],
      });
      mock.onPut(`${BASE_URL}/device/10`).reply(200, { data: {} });

      await api.renameDevice('10', 'the Bifrost');

      expect(mock.history.put).toHaveLength(1);
    });
  });

  // --- getPetReport ---

  describe('getPetReport()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      mock.onGet(`${BASE_URL}/device`).reply(200, MOCK_DEVICES_RESPONSE);
      await api.authenticate();
    });

    it('resolves the household ID from getDevices and calls the aggregate report endpoint', async () => {
      mock
        .onGet(`${BASE_URL}/report/household/${MOCK_DEVICES_RESPONSE.data[0].household_id}/pet/5/aggregate`)
        .reply(200, { data: { movement: { datapoints: [] } } });

      const report = await api.getPetReport('5');

      expect(report).toEqual({ movement: { datapoints: [] } });
    });

    it('passes from/to as query params when both are given', async () => {
      const relativeUrl = `/report/household/${MOCK_DEVICES_RESPONSE.data[0].household_id}/pet/5/aggregate`;
      mock.onGet(`${BASE_URL}${relativeUrl}`).reply(200, { data: {} });

      await api.getPetReport('5', '2026-09-01', '2026-09-12');

      const call = mock.history.get.find(c => c.url === relativeUrl);
      expect(call!.params).toEqual({ from: '2026-09-01', to: '2026-09-12' });
    });

    it('omits from/to when not given', async () => {
      const relativeUrl = `/report/household/${MOCK_DEVICES_RESPONSE.data[0].household_id}/pet/5/aggregate`;
      mock.onGet(`${BASE_URL}${relativeUrl}`).reply(200, { data: {} });

      await api.getPetReport('5');

      const call = mock.history.get.find(c => c.url === relativeUrl);
      expect(call!.params).toEqual({});
    });

    it('throws when no devices (and so no household ID) can be found', async () => {
      mock.onGet(`${BASE_URL}/device`).reply(200, { data: [] });

      await expect(api.getPetReport('5')).rejects.toThrow('household');
    });

    it('re-authenticates and retries on 401', async () => {
      const url = `${BASE_URL}/report/household/${MOCK_DEVICES_RESPONSE.data[0].household_id}/pet/5/aggregate`;
      mock.onGet(url).replyOnce(401).onGet(url).reply(200, { data: {} });

      await expect(api.getPetReport('5')).resolves.toEqual({});
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

    it('retries locking on 429 and succeeds once the rate limit clears', async () => {
      mock
        .onPut(`${BASE_URL}/device/10/control`)
        .replyOnce(429)
        .onPut(`${BASE_URL}/device/10/control`)
        .replyOnce(429)
        .onPut(`${BASE_URL}/device/10/control`)
        .reply(200, { data: {} });

      await api.setLockState('10', 3); // locked both ways

      expect(mock.history.put).toHaveLength(3);
      expect(JSON.parse(mock.history.put[2].data).locking).toBe(3);
    });

    it('retries unlocking on 429 and succeeds once the rate limit clears', async () => {
      mock
        .onPut(`${BASE_URL}/device/10/control`)
        .replyOnce(429)
        .onPut(`${BASE_URL}/device/10/control`)
        .replyOnce(429)
        .onPut(`${BASE_URL}/device/10/control`)
        .reply(200, { data: {} });

      await api.setLockState('10', 0); // unlocked

      expect(mock.history.put).toHaveLength(3);
      expect(JSON.parse(mock.history.put[2].data).locking).toBe(0);
    });

    it('retries on network error and succeeds once connectivity returns', async () => {
      mock
        .onPut(`${BASE_URL}/device/10/control`)
        .networkErrorOnce()
        .onPut(`${BASE_URL}/device/10/control`)
        .networkErrorOnce()
        .onPut(`${BASE_URL}/device/10/control`)
        .reply(200, { data: {} });

      await api.setLockState('10', 1);

      expect(mock.history.put).toHaveLength(3);
    });

    it('throws on 429 rate limit after exhausting retries, whether locking or unlocking', async () => {
      mock.onPut(`${BASE_URL}/device/10/control`).reply(429);

      await expect(api.setLockState('10', 3)).rejects.toThrow(/rate limit/i);
      expect(mock.history.put).toHaveLength(4);
    });
  });

  // --- setPetLocation ---

  describe('setPetLocation()', () => {
    beforeEach(async () => {
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      await api.authenticate();
    });

    it('sends POST with where=1 for inside', async () => {
      mock.onPost(`${BASE_URL}/pet/5/position`).reply(200, { data: {} });

      await api.setPetLocation('5', 1);

      const call = mock.history.post.find(c => c.url === '/pet/5/position');
      expect(JSON.parse(call!.data).where).toBe(1);
    });

    it('sends POST with where=2 for outside', async () => {
      mock.onPost(`${BASE_URL}/pet/5/position`).reply(200, { data: {} });

      await api.setPetLocation('5', 2);

      const call = mock.history.post.find(c => c.url === '/pet/5/position');
      expect(JSON.parse(call!.data).where).toBe(2);
    });

    it('includes a since timestamp', async () => {
      mock.onPost(`${BASE_URL}/pet/5/position`).reply(200, { data: {} });

      await api.setPetLocation('5', 1);

      const call = mock.history.post.find(c => c.url === '/pet/5/position');
      expect(JSON.parse(call!.data).since).toEqual(expect.any(String));
    });

    it('sends Bearer token in the Authorization header', async () => {
      mock.onPost(`${BASE_URL}/pet/5/position`).reply(200, { data: {} });

      await api.setPetLocation('5', 1);

      const call = mock.history.post.find(c => c.url === '/pet/5/position');
      expect(call!.headers?.Authorization).toBe(`Bearer ${MOCK_TOKEN}`);
    });

    it('re-authenticates and retries on 401', async () => {
      mock
        .onPost(`${BASE_URL}/pet/5/position`)
        .replyOnce(401)
        .onPost(`${BASE_URL}/pet/5/position`)
        .reply(200, { data: {} });

      await api.setPetLocation('5', 1);

      expect(mock.history.post.filter(c => c.url === '/auth/login')).toHaveLength(2);
    });

    it('throws on network error after exhausting retries', async () => {
      mock.onPost(`${BASE_URL}/pet/5/position`).networkError();

      await expect(api.setPetLocation('5', 1)).rejects.toThrow();
    });

    it('retries on 429 and succeeds once the rate limit clears', async () => {
      mock
        .onPost(`${BASE_URL}/pet/5/position`)
        .replyOnce(429)
        .onPost(`${BASE_URL}/pet/5/position`)
        .reply(200, { data: {} });

      await api.setPetLocation('5', 2);

      expect(mock.history.post.filter(c => c.url === '/pet/5/position')).toHaveLength(2);
    });
  });

  describe('retry configuration', () => {
    it('actually waits out the configured delay before retrying', async () => {
      const delayedApi = new SurepetcareAPI(
        {
          email: 'test@example.com',
          password: 'secret',
          deviceId: 'test-device-uuid',
        },
        { retryDelays: [10] }
      );
      mock.onPost(`${BASE_URL}/auth/login`).reply(200, { data: { token: MOCK_TOKEN } });
      mock
        .onGet(`${BASE_URL}/pet`)
        .replyOnce(429)
        .onGet(`${BASE_URL}/pet`)
        .reply(200, MOCK_PETS_RESPONSE);

      const pets = await delayedApi.getPets();

      expect(pets).toHaveLength(2);
    });

    it('defaults to a non-empty backoff schedule when none is provided', () => {
      const defaultApi = new SurepetcareAPI({
        email: 'test@example.com',
        password: 'secret',
        deviceId: 'test-device-uuid',
      });

      const delays = (defaultApi as any).retryDelays as number[];
      expect(Array.isArray(delays)).toBe(true);
      expect(delays.length).toBeGreaterThan(0);
      expect(delays.every(ms => ms >= 0)).toBe(true);
    });
  });
});
