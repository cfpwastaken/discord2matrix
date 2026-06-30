import { readFile } from "fs/promises";
import { awaitFederation, getRequestCount, sendEvent } from "../homeserver";

const config = JSON.parse(await readFile("config.json", "utf-8")) as Config;
const ROOM = process.argv[2]!;
const USERS = Object.values(config.mapping).map((v) => v.mxid);

const COUNT = 100;

const start = Date.now();
for(let i = 0; i < COUNT; i++) {
	const user = USERS[i % USERS.length];
	const eventId = await sendEvent({
		roomId: ROOM,
		userId: user!,
		ts: Date.now(),
		eventType: "m.room.message",
		content: {
			msgtype: "m.text",
			body: i + "",
		},
	});
	const otherUser = USERS[(i + 1) % USERS.length];
	await awaitFederation(eventId, ROOM, otherUser!);
	console.log(`Event ${eventId} sent by ${user} and received by ${otherUser}`);
}
const end = Date.now();
console.log(`Sent ${COUNT} events in ${end - start}ms`);
const eventsPerSecond = 1000 * COUNT / (end - start);
console.log(`Throughput: ${eventsPerSecond.toFixed(2)} events/s`);
console.log("Total requests made to homeservers:", getRequestCount());
