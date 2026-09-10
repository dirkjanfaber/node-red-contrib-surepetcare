# node-red-contrib-surepetcare

Node-RED nodes for the [SurePetcare](https://www.surepetcare.com) cloud API. Monitor pet locations and control SureFlap cat flap lock states from your Node-RED flows.

> **Disclaimer:** This project is not affiliated with, endorsed by, or in any way associated with Sure Petcare Ltd. It is an independent, community-developed integration created by happy users of their hardware and software. SurePetcare, SureFlap, and SureFeed are trademarks of Sure Petcare Ltd. Use of this package is at your own risk. The underlying API is unofficial and reverse-engineered by the community - it may change or break without notice.

## Nodes

### `surepetcare-config`
Config node. Holds your SurePetcare account credentials and manages the API token lifecycle.

### `surepetcare-pets`
Polls the SurePetcare API for pet locations. Emits one message per pet:

| Property | Type | Description |
|---|---|---|
| `payload.id` | number | Pet ID |
| `payload.name` | string | Pet name |
| `payload.location` | string | `inside` or `outside` |
| `payload.since` | string | ISO 8601 timestamp of last position change |

Send any message to the input to trigger an immediate poll. Set **Poll interval** to 0 to disable automatic polling.

### `surepetcare-control`
Sets the lock state of a SureFlap cat flap, or renames the device.

| `msg.payload.lockState` | Meaning |
|---|---|
| `0` | Unlocked (both directions) |
| `1` | Locked in (entry only) |
| `2` | Locked out (exit only) |
| `3` | Locked (both directions) |

Both `deviceId` and `lockState` can be overridden per message via `msg.payload`. If
`msg.payload.name` is set instead, the device is renamed rather than locked.

### `surepetcare-devices`
Polls the SurePetcare API for device status. Emits one message per device:

| Property | Type | Description |
|---|---|---|
| `payload.deviceId` | string | Device ID, for use with `surepetcare-control` |
| `payload.name` | string | Device name |
| `payload.lockingMode` | number | Live lock state - see below |
| `payload.curfew` | array | Configured curfew windows: `[{ lock_time, unlock_time, enabled }]` |

`lockingMode` reports more than the settable lock states, since it reflects what the
flap is actually doing right now:

| `lockingMode` | Meaning |
|---|---|
| `0`-`3` | Same as `surepetcare-control`'s `lockState` above |
| `4` | Locking deferred to the device's own curfew schedule |
| `-1` | Curfew currently engaged (exit blocked, entry still allowed) |
| `-2` | Curfew currently released |
| `-3` | Curfew status unknown |

Send any message to the input to trigger an immediate poll. Set **Poll interval** to 0
to disable automatic polling.

## Reliability

Every API call - polling or control - automatically retries on `429` (rate limit) and
network errors with exponential backoff before giving up, so a single dropped request
(e.g. a curfew unlock command) doesn't leave the flap stuck in the wrong state until the
next scheduled event.

## Examples

The `examples/` directory has ready-to-import flows (Node-RED menu -> Import -> select file):

- **`curfew-full-lock.json`** - upgrades the flap's own curfew from a one-way lock
  (exit blocked, entry still allowed) to a full both-ways lock, but only once every
  pet's chip is confirmed inside, so a straggler is never locked out.
- **`night-lockout.json`** - forces the flap locked on a fixed schedule as a backup for
  when the app's own curfew doesn't engage reliably.
- **`daily-flap-rename.json`** - example of using the rename capability.
- **`cat-ev-tracker.json`** - example pet-location tracking flow.

## Installation

```bash
cd ~/.node-red
npm install node-red-contrib-surepetcare
```

## Configuration

1. Add any `surepetcare-pets`, `surepetcare-control`, or `surepetcare-devices` node to your flow
2. Create a new **SurePetcare config** node with your account email and password
3. A stable device ID is generated automatically on first save

## References

- Reverse-engineered API (PHP): https://github.com/alextoft/sureflap
- Python client (surepy): https://github.com/benleb/surepy
- Local MQTT alternative (PetHubLocal): https://github.com/PetHubLocal/pethublocal
