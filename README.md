# discord2matrix

![Discord to Matrix Adapter](/discord-to-matrix.png)

**Work in progress**

Matrix chat importer for Discord.
Convert a Discord chat export to a Matrix chat export, import it across multiple homeservers, go wild.

## Usage

### Configure

config.json:

```json
{
	"homeservers": {
		"matrix.org": {
			"url": "https://matrix.org",
			"as_token": "<application service token>",
		},
		"example.com": {
			"url": "https://matrix.example.com",
			"as_token": "<application service token>",
		}
	},
	"mapping": {
		"discord-user-id": {
			"homeserver": "matrix.org",
			"mxid": "@matrix-user:matrix.org"
		}
	},
	"rooms": {
		"discord-channel-id": {
			"room_id": "!matrix-room-id:matrix.org",
		}
	}
}
```

### Convert a Discord export to a Matrix export

```bash
bun run src/tools/discord.ts <discord-export.json> <matrix-export.json>
```

The script will automatically convert every discord message to an equivalent Matrix event (or multiple if required).
Note that this will cause a ton of media uploads to the homeservers, so make sure you have enough bandwidth and that the homeservers are ready to receive a ton of them.

### Test speed

```bash
bun run src/tools/fedtest.ts <room_id>
```

Will send 100 events, alternating between two homeservers, and measure the time it takes to federate them and the throughput in events per second.

### Import a Matrix export

```bash
bun run src/tools/import.ts <matrix-export.json>
```

This will import the entire Matrix export.
It will take a while, as it has to wait for federation to complete to every participating homeserver before sending the next event, to avoid events getting received out of order.
All participating homeservers need to be ready to receive a ton of events. Do not run this on a public homeserver, as it will likely get rate limited or banned (not that you would get a public homeserver to give you an application service token anyway).
