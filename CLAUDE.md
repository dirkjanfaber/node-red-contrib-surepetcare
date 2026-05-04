<!-- source: 00-system.md -->
# node-red-contrib-sureflap

A Node-RED node package for interacting with the SurePetcare/SureFlap Connect series of smart cat flaps. Provides pet location monitoring, flap lock control, and time-based curfew automation.

## Project goals

- Implement Node-RED nodes for the SurePetcare cloud API
- TypeScript implementation, compiled to JS for Node-RED runtime
- Future-proof: architecture should allow swapping cloud API for local PetHubLocal/MQTT backend later
- Publish as `node-red-contrib-sureflap` on npm

## Architecture

### Nodes to implement

1. **`sureflap-config`** — config node, handles credentials + token lifecycle
2. **`sureflap-pets`** — polls pet locations, emits messages per cat
3. **`sureflap-control`** — sets flap lock state (open/locked-in/locked-out/locked)

### Directory structure

```
node-red-contrib-sureflap/
├── src/
│   ├── nodes/
│   │   ├── sureflap-config/
│   │   │   ├── sureflap-config.ts
│   │   │   └── sureflap-config.html
│   │   ├── sureflap-pets/
│   │   │   ├── sureflap-pets.ts
│   │   │   └── sureflap-pets.html
│   │   └── sureflap-control/
│   │       ├── sureflap-control.ts
│   │       └── sureflap-control.html
│   ├── lib/
│   │   └── sureflap-api.ts   ← API client, isolated from Node-RED
│   └── types/
│       └── sureflap.d.ts     ← shared types
├── dist/                     ← compiled output (gitignored)
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## SurePetcare API

The API is unofficial (reverse engineered by the community) but stable since 2018.

**Base URL:** `https://app.api.surehub.io/api`

### Authentication

```
POST /auth/login
Content-Type: application/json

{
  "email_address": "user@example.com",
  "password": "secret",
  "device_id": "any-stable-uuid"   ← generate once, persist in config node
}
```

Response: `{ data: { token: "..." } }`

- Token is long-lived (~90 days), but re-auth after 24h to be safe
- Cache token in the config node instance, not global context

### Pets / locations

```
GET /pet?with[]=position
Authorization: Bearer {token}
```

Response: `{ data: [ { id, name, position: { where: 1|2 } } ] }`

- `where: 1` = inside
- `where: 2` = outside

### Devices

```
GET /device
Authorization: Bearer {token}
```

Used once on startup to discover device IDs needed for control calls.

### Lock control

```
PUT /device/{device_id}/control
Authorization: Bearer {token}
Content-Type: application/json

{ "locking": 0 }
```

Lock state values:

| Value | Meaning |
|-------|---------|
| `0` | Unlocked (both directions) |
| `1` | Locked in (entry only — cats can come in, not go out) |
| `2` | Locked out (exit only) |
| `3` | Locked both ways |

### Error handling

- 401: re-authenticate and retry once
- 429: back off, respect rate limits — do not poll faster than every 60s
- Network errors: emit Node-RED status error, do not crash

## Node-RED conventions to follow

- Config nodes hold credentials and shared state (token, device list)
- All nodes must accept `msg.payload` overrides where relevant
- Use `node.status()` to show connection state (green=ok, yellow=connecting, red=error)
- Emit errors via `node.error(err, msg)` — not `throw`
- Register nodes in `package.json` under `"node-red": { "nodes": { ... } }`
- HTML files must use Node-RED's `<script type="text/javascript">` + `RED.nodes.registerType` pattern

## API client design (`sureflap-api.ts`)

Keep the API client completely independent of Node-RED so it can be tested standalone and later replaced with a PetHubLocal MQTT client behind the same interface.

```typescript
interface SureflapBackend {
  getPets(): Promise<Pet[]>
  setLockState(deviceId: string, state: LockState): Promise<void>
  getDevices(): Promise<Device[]>
}
```

Implement `SureflapCloudAPI implements SureflapBackend` now. Later: `SureflapLocalMQTT implements SureflapBackend`.

## TypeScript setup

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

Dependencies:
- `axios` or `node-fetch` for HTTP
- `@types/node` for Node.js types
- `@node-red/types` for Node-RED type definitions

Dev dependencies:
- `typescript`
- `@types/node`
- `jest` + `ts-jest` for testing

## Testing & TDD

Development follows strict TDD: **write the test first, then implement**.

### Workflow

1. Write a failing test that describes the desired behaviour
2. Run the test suite — confirm it fails for the right reason
3. Write the minimal implementation to make it pass
4. Refactor, keeping tests green
5. Repeat

Never write implementation code without a failing test to justify it.

### Test structure

```
src/
└── __tests__/
    ├── sureflap-api.test.ts      ← API client unit tests (mock HTTP)
    ├── sureflap-pets.test.ts     ← Node-RED node tests (test-helper)
    └── sureflap-control.test.ts  ← Node-RED node tests (test-helper)
```

### Running tests

```bash
npm test              # run all tests
npm test -- --watch   # watch mode during development
npm test -- --coverage
```

### API client tests (`sureflap-api.test.ts`)

Use `jest` + `axios-mock-adapter` (or `nock`) to mock HTTP. Test against real observed API payloads — copy actual responses from the SurePetcare app via browser devtools or the surepy CLI.

```typescript
// Example: test token caching
it('should not re-authenticate if token is still fresh', async () => {
  const api = new SureflapCloudAPI({ email: 'x', password: 'y' });
  const loginSpy = jest.spyOn(api, 'login');
  await api.authenticate();
  await api.authenticate(); // second call within 24h
  expect(loginSpy).toHaveBeenCalledTimes(1);
});

// Example: test 401 retry
it('should re-authenticate and retry on 401', async () => {
  // mock: first call returns 401, second returns 200
  // expect: one automatic retry, result returned correctly
});
```

### Node-RED node tests

Use `@node-red/test-helper` to load and wire nodes in isolation.

```typescript
import helper from '@node-red/test-helper';
import sureflapPets from '../nodes/sureflap-pets/sureflap-pets';

beforeEach(() => helper.startServer());
afterEach(() => helper.unload());

it('should emit inside/outside per cat on poll', async () => {
  const flow = [
    { id: 'cfg', type: 'sureflap-config', ... },
    { id: 'n1', type: 'sureflap-pets', config: 'cfg', wires: [['n2']] },
    { id: 'n2', type: 'helper' }
  ];
  await helper.load([sureflapConfig, sureflapPets], flow);
  const n2 = helper.getNode('n2');
  // trigger poll, assert messages
});
```

### Coverage targets

| Area | Target |
|------|--------|
| API client | 100% |
| Node logic | ≥ 90% |
| Error paths (401, 429, network) | 100% |

## References

- Reverse-engineered API (PHP): https://github.com/alextoft/sureflap
- Python implementation (most complete): https://github.com/benleb/surepy
- PetHubLocal (local MQTT replacement): https://github.com/PetHubLocal/pethublocal
- Style reference (author's other nodes): https://github.com/victronenergy/node-red-contrib-victron

## Notes

- `device_id` in the auth payload should be a stable UUID per installation — generate on first run and persist in the config node's credentials
- The API has no official webhook/push support — polling is the only option for the cloud backend
- PetHubLocal uses MQTT topics like `pethub/ha/{serial}/KeepIn` (ON/OFF) and `pethub/{serial}/status` for pet presence — keep this in mind when designing the internal event model so switching backends later is a small diff

<!-- source: 40-ai-rules.md -->

