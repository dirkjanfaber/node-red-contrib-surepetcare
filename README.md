# node-red-contrib-surepetcare

Node-RED nodes for the [SurePetcare](https://www.surepetcare.com) cloud API. Monitor pet locations, control SureFlap cat flap lock states, and query pet activity stats from your Node-RED flows.

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

### `surepetcare-pet-control`
Sets a pet's inside/outside status directly - useful for linking an automation (e.g. a
door sensor) to a pet's recorded location, without needing a flap event.

Both `petId` and `location` (`inside`/`outside`) can be overridden per message via
`msg.payload`.

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

### `surepetcare-report`
On-demand lookup of aggregated inside/outside activity stats for a pet - the same data
behind the app's activity view.

| Property | Type | Description |
|---|---|---|
| `payload.petId` | string | Pet ID that was queried (overridable via `msg.payload.petId`) |
| `payload.fromDate` | string | Start date used, if a range was given (`YYYY-MM-DD`) |
| `payload.toDate` | string | End date used, if a range was given (`YYYY-MM-DD`) |
| `payload.report` | object | Raw `{ movement, feeding, drinking }` data. Movement entries have `from`/`to` timestamps and a `duration` in seconds spent outside. |

`msg.payload.fromDate`/`msg.payload.toDate` must be given together, or omitted together.
Omitting both uses the API's default range - the underlying endpoint can return a very
large response when unbounded, so prefer an explicit range for anything beyond a quick
check. This is a one-off lookup triggered by an input message, not a poller.

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
- **`feed-on-arrival.json`** - dispenses each cat's breakfast/lunch/dinner via a
  PetKit feeder, triggered by arrival through the flap (or by already being home when
  the window opens). Requires `node-red-contrib-petkit` alongside this package - see
  its own info panel for the full design.

## Installation

```bash
cd ~/.node-red
npm install node-red-contrib-surepetcare
```

## Configuration

1. Add any `surepetcare-pets`, `surepetcare-control`, `surepetcare-pet-control`, `surepetcare-devices`, or `surepetcare-report` node to your flow
2. Create a new **SurePetcare config** node with your account email and password
3. A stable device ID is generated automatically on first save

## References

- Reverse-engineered API (PHP): https://github.com/alextoft/sureflap
- Python client (surepy): https://github.com/benleb/surepy
- Local MQTT alternative (PetHubLocal): https://github.com/PetHubLocal/pethublocal
