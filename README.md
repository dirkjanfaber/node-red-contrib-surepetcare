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
Sets the lock state of a SureFlap cat flap.

| `msg.payload.lockState` | Meaning |
|---|---|
| `0` | Unlocked (both directions) |
| `1` | Locked in (entry only) |
| `2` | Locked out (exit only) |
| `3` | Locked (both directions) |

Both `deviceId` and `lockState` can be overridden per message via `msg.payload`.

## Installation

```bash
cd ~/.node-red
npm install node-red-contrib-surepetcare
```

## Configuration

1. Add any `surepetcare-pets` or `surepetcare-control` node to your flow
2. Create a new **SurePetcare config** node with your account email and password
3. A stable device ID is generated automatically on first save

## References

- Reverse-engineered API (PHP): https://github.com/alextoft/sureflap
- Python client (surepy): https://github.com/benleb/surepy
- Local MQTT alternative (PetHubLocal): https://github.com/PetHubLocal/pethublocal
