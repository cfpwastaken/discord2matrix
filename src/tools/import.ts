import { readFile } from "fs/promises";
import { awaitAllFederation, getRequestCount, sendEvent } from "../homeserver";
import ora from "ora";

const inputFile = process.argv[2] || "export-matrix.json";
const file = JSON.parse(await readFile(inputFile, "utf-8")) as ChatExport;

function getAllParticipatingHomeservers(file: ChatExport) {
	const homeservers = new Set<string>();
	for(const message of file.messages) {
		const homeserver = message.sender.split(":")[1];
		if (!homeserver) {
			throw new Error(`Invalid sender ID: ${message.sender}`);
		}
		homeservers.add(homeserver);
	}
	return homeservers;
}

const homeservers = getAllParticipatingHomeservers(file);


const messageIds = new Map<string, string>();

function log(...args: any[]) {
	spinner.clear();
	console.log(...args);
	spinner.render();
}

function remapEventIDs(content: any): object {
	if(typeof content !== "object" || content === null) {
		return content;
	}
	if(content["m.relates_to"] && content["m.relates_to"]["event_id"]) {
		log("Mapping event ID", content["m.relates_to"]["event_id"], "->", messageIds.get(content["m.relates_to"]["event_id"]));
		content["m.relates_to"]["event_id"] = messageIds.get(content["m.relates_to"]["event_id"]);
	}
	if(content["m.relates_to"] && content["m.relates_to"]["m.in_reply_to"] && content["m.relates_to"]["m.in_reply_to"]["event_id"]) {
		log("Mapping event ID", content["m.relates_to"]["m.in_reply_to"]["event_id"], "->", messageIds.get(content["m.relates_to"]["m.in_reply_to"]["event_id"]));
		content["m.relates_to"]["m.in_reply_to"]["event_id"] = messageIds.get(content["m.relates_to"]["m.in_reply_to"]["event_id"]);
	}
	return content;
}

let spinner = ora("Importing messages...").start();

for(const message of file.messages) {
	const id = await sendEvent({
		roomId: message.room_id,
		eventType: message.type,
		userId: message.sender,
		ts: message.origin_server_ts,
		content: remapEventIDs(message.content),
	});
	messageIds.set(message.event_id, id);
	await awaitAllFederation(id, message.room_id, homeservers);
	spinner.text = `Importing messages... (${messageIds.size}/${file.messages.length}) - date ${new Date(message.origin_server_ts).toISOString()} - last imported: ${id} - requests: ${getRequestCount()}`;
	// console.log(message.event_id, "->", id);
}

spinner.succeed(`Imported ${messageIds.size} messages!`);
