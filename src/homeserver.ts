import { readFile, writeFile } from "fs/promises";

const config = JSON.parse(await readFile("config.json", "utf-8")) as Config;

function getHomeserver(mxid: string) {
	const domain = mxid.split(":")[1]!;
	if(!config.homeservers[domain]) {
		throw new Error(`No config found for homeserver ${domain}`);
	}
	return config.homeservers[domain];
}

function getAnyUserFromHomeserver(homeserver: string) {
	for(const [dcic, mapping] of Object.entries(config.mapping)) {
		if(mapping.homeserver === homeserver) {
			return mapping.mxid;
		}
	}
	throw new Error(`No user found for homeserver ${homeserver}`);
}

let requests = 0;

export async function sendEvent(options: {
	roomId: string;
	eventType: string;
	userId: string;
	ts: number;
	content: object;
}) {
	const homeserver = getHomeserver(options.userId);
	console.log("Sending message as " + options.userId + " via " + homeserver.url + " to room " + options.roomId);
	const res = await fetch(`${homeserver.url}/_matrix/client/v3/rooms/${encodeURIComponent(options.roomId)}/send/${encodeURIComponent(options.eventType)}/${Date.now()}?user_id=${encodeURIComponent(options.userId)}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${homeserver.as_token}`,
		},
		body: JSON.stringify({
			...options.content,
			"de.importer.original_ts": options.ts,
		}),
	});
	requests++;
	if (!res.ok) {
		const errorText = await res.text();
		console.log(JSON.stringify(options, null, 2));
		throw new Error(`Failed to send event: ${res.status} ${res.statusText} - ${errorText}`);
	}
	const data = await res.json() as { event_id: string };
	console.log("=> " + data.event_id);
	return data.event_id;
}

export async function awaitFederation(eventId: string, roomId: string, otherUser: string, timeout = 30000) {
	const homeserver = getHomeserver(otherUser);
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const res = await fetch(`${homeserver.url}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}?user_id=${encodeURIComponent(otherUser)}`, {
			method: "GET",
			headers: {
				"Authorization": `Bearer ${homeserver.as_token}`,
			},
		});
		requests++;
		if (res.ok) {
			return;
		} else if (res.status !== 404) {
			const errorText = await res.text();
			console.error(`Failed to await federation: from ${homeserver.url} - ${eventId} - ${res.status} ${res.statusText} - ${errorText}`);
		}
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	throw new Error(`Event ${eventId} was not federated to ${homeserver.url} within ${timeout}ms`);
}

export async function awaitAllFederation(eventId: string, roomId: string, homeservers: Set<string>) {
	for (const homeserver of homeservers) {
		await awaitFederation(eventId, roomId, getAnyUserFromHomeserver(homeserver));
	}
}

export function getRequestCount() {
	return requests;
}

const uploadCache = JSON.parse(await readFile("upload_cache.json", "utf-8")) as Record<string, string>;

export async function uploadFile(options: {
	userId: string;
	file: Buffer<ArrayBufferLike>;
	filename: string;
	mimetype: string;
}) {
	throw new Error("uploadFile is disabled for now");
	if(uploadCache[options.filename]) {
		return uploadCache[options.filename];
	}
	console.log("Uploading file", options.filename);
	const homeserver = getHomeserver(options.userId);
	const res = await fetch(`${homeserver.url}/_matrix/media/v3/upload?filename=${encodeURIComponent(options.filename)}&user_id=${encodeURIComponent(options.userId)}`, {
		method: "POST",
		headers: {
			"Content-Type": options.mimetype,
			"Authorization": `Bearer ${homeserver.as_token}`,
		},
		body: options.file,
	});
	requests++;
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to upload file: ${res.status} ${res.statusText} - ${errorText}`);
	}
	const data = await res.json() as { content_uri: string };
	uploadCache[options.filename] = data.content_uri;
	await writeFile("upload_cache.json", JSON.stringify(uploadCache));
	return data.content_uri;
}
