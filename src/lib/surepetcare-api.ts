import axios, { AxiosInstance } from 'axios';
import { Device, LockState, Pet, SurepetcareBackend, SurepetcareCredentials } from '../types/surepetcare';

const BASE_URL = 'https://app.api.surehub.io/api';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
// Backoff schedule applied to 429s and network errors, shared by every
// call (locking and unlocking included) so neither direction is a single
// point of failure.
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 9000];

export interface SurepetcareAPIOptions {
  retryDelays?: number[];
}

export class SurepetcareAPI implements SurepetcareBackend {
  private credentials: SurepetcareCredentials;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private http: AxiosInstance;
  private retryDelays: number[];

  constructor(credentials: SurepetcareCredentials, options: SurepetcareAPIOptions = {}) {
    this.credentials = credentials;
    this.http = axios.create({ baseURL: BASE_URL });
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS_MS;
  }

  async authenticate(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return;
    }
    const response = await this.http.post('/auth/login', {
      email_address: this.credentials.email,
      password: this.credentials.password,
      device_id: this.credentials.deviceId,
    });
    this.token = response.data.data.token;
    this.tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let reauthenticated = false;
    let attempt = 0;

    for (;;) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.response?.status;

        if (status === 401 && !reauthenticated) {
          reauthenticated = true;
          this.token = null;
          await this.authenticate();
          continue;
        }

        const isRateLimited = status === 429;
        const isNetworkError = !err?.response;

        if ((isRateLimited || isNetworkError) && attempt < this.retryDelays.length) {
          await this.sleep(this.retryDelays[attempt]);
          attempt++;
          continue;
        }

        if (isRateLimited) {
          throw new Error('Rate limit exceeded - back off before retrying');
        }
        throw err;
      }
    }
  }

  async getPets(): Promise<Pet[]> {
    await this.authenticate();
    return this.withRetry(async () => {
      const response = await this.http.get('/pet', {
        params: { 'with[]': 'position' },
        headers: this.authHeaders(),
      });
      return response.data.data as Pet[];
    });
  }

  async getDevices(): Promise<Device[]> {
    await this.authenticate();
    return this.withRetry(async () => {
      const response = await this.http.get('/device', {
        params: { 'with[]': 'control' },
        headers: this.authHeaders(),
      });
      return response.data.data as Device[];
    });
  }

  async renameDevice(deviceId: string, name: string): Promise<void> {
    await this.authenticate();

    // PUT /device/{id} (unlike /device/{id}/control) has been observed to
    // reset the device's lock override to unlocked as a side effect of the
    // rename, even though locking isn't part of this request body. Capture
    // whatever explicit override (0-3) was active beforehand and re-assert
    // it once the rename completes, so a curfew-driven lock - e.g. the
    // escalation in examples/curfew-full-lock.json - doesn't silently get
    // dropped by an unrelated rename. Modes outside 0-3 mean the flap is
    // governed by the app's own curfew schedule rather than an explicit
    // override, so there's nothing to re-assert.
    const [device] = await this.getDevices().then(devices => devices.filter(d => String(d.id) === deviceId));
    const priorLockState = device?.status?.locking?.mode;

    await this.withRetry(async () => {
      await this.http.put(`/device/${deviceId}`, { name }, {
        headers: this.authHeaders(),
      });
    });

    if (priorLockState !== undefined && priorLockState >= 0 && priorLockState <= 3) {
      await this.setLockState(deviceId, priorLockState as LockState);
    }
  }

  async setLockState(deviceId: string, state: LockState): Promise<void> {
    await this.authenticate();
    return this.withRetry(async () => {
      await this.http.put(`/device/${deviceId}/control`, { locking: state }, {
        headers: this.authHeaders(),
      });
    });
  }
}
