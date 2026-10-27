import { fileTypeFromFile } from "file-type";
import { readFile, stat, writeFile } from "fs/promises";
import { imageSizeFromFile } from "image-size/fromFile";
import { parseInline } from "marked";
import { uploadFile } from "../homeserver";

// Convert a discord chat export to a matrix one
const inputFile = process.argv[2] || "export.json";
const outputFile = process.argv[3] || "export-matrix.json";

const input = JSON.parse(await readFile(inputFile, "utf-8")) as DiscordChatExport;
const config = JSON.parse(await readFile("config.json", "utf-8")) as Config;

async function uploadImage(path: string, userId: string) {
	const dim = await imageSizeFromFile(path);
	const stats = await stat(path);
	const fileType = await fileTypeFromFile(path);
	const mime = fileType?.mime || "application/octet-stream";
	const mxc = await uploadFile({
		userId,
		file: Buffer.from(await readFile(path)),
		filename: path.split("/").pop()!,
		mimetype: mime,
	});
	return {
		url: mxc,
		w: dim.width,
		h: dim.height,
		size: stats.size,
		mime,
	};
}

const messageTypes: Record<DiscordMessageType, string> = {
	Default: "m.room.message",
	RecipientAdd: "m.room.member",
	RecipientRemove: "m.room.member",
	Call: "m.call.invite",
	ChannelNameChange: "m.room.name",
	ChannelIconChange: "m.room.avatar",
	ChannelPinnedMessage: "m.room.pinned_events",
	GuildMemberJoin: "m.room.member",
	ThreadCreated: "m.thread.create",
	Reply: "m.room.message",
};

function translateMarkdown(content: string): string {
	return parseInline(content, {
		async: false,
	});
}

function pingToMatrix(content: string, ping: DiscordChatExportAuthor): {
	content: string;
	userId: string;
} {
	// @<nickname> => <a href=\"https://matrix.to/#/@<mxid>\">@<mxid></a>
	const mapped = mapUser(ping.id);
	const newContent = content.replace("@" + ping.nickname, `<a href="https://matrix.to/#/${mapped}">@${mapped}</a>`);
	return {
		content: newContent,
		userId: mapped
	};
}

function translateSpoilers(content: string): string {
	// ||spoiler|| => <span data-mx-spoiler>spoiler</span>
	return content.replace(/\|\|(.+?)\|\|/g, `<span data-mx-spoiler>$1</span>`);
}

async function translateAttachment(attachment: DiscordChatExportAttachment, userId: string): Promise<{ type: string; content: object }> {
	const IS_IMAGE = attachment.fileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
	if (IS_IMAGE) {
		// const image = await uploadImage(attachment.url, mapUser(userId));
		return {
			type: "m.room.message",
			content: {
				body: attachment.fileName,
				filename: attachment.fileName,
				// info: {
				// 	mimetype: image.mime,
				// 	"org.matrix.msc4230.is_animated": false,
				// 	size: image.size,
				// 	w: image.w,
				// 	h: image.h,
				// },
				msgtype: "m.image",
				// url: image.url,
				"de.importer.imported_from": "discord",
			}
		}
	};
	// const fileType = await fileTypeFromFile(attachment.url);
	// const mime = fileType?.mime || "application/octet-stream";
	// const file = await uploadFile({
	// 	userId: mapUser(userId),
	// 	file: Buffer.from(await readFile(attachment.url)),
	// 	filename: attachment.fileName,
	// 	mimetype: mime,
	// });
	return {
		type: "m.room.message",
		content: {
			body: attachment.fileName,
			filename: attachment.fileName,
			info: {
				// mimetype: mime,
				size: attachment.fileSizeBytes,
			},
			msgtype: "m.file",
			// url: file,
			"de.importer.imported_from": "discord",
		}
	}
}

const messageContents: Record<DiscordMessageType, (message: DiscordChatExportMessage) => object> = {
	Default: (message) => {
		let formatted = translateSpoilers(message.content);
		let mentions = [];
		for (const mention of message.mentions) {
			const { content, userId } = pingToMatrix(formatted, mention);
			formatted = content;
			mentions.push(userId);
		}
		formatted = translateMarkdown(formatted);
		const res: any = {
			body: message.content,
			msgtype: "m.text",
			format: "org.matrix.custom.html",
			formatted_body: formatted,
		};
		if(mentions.length > 0) {
			res["m.mentions"] = {
				user_ids: mentions,
			};
		}
		return res;
	},
	RecipientAdd: (message) => ({}), // TODO: do we have this in our exports?
	RecipientRemove: (message) => ({}), // TODO: do we have this in our exports?
	Call: (message) => ({
		msgtype: "m.call.invite",
		body: "Call invite",
	}),
	ChannelNameChange: (message) => ({
		msgtype: "m.room.name",
		name: message.content,
	}),
	ChannelIconChange: (message) => ({
		msgtype: "m.room.avatar",
		url: message.content, // TODO, should be a mxc url pointing to the uploaded image
	}),
	ChannelPinnedMessage: (message) => ({
		msgtype: "m.room.pinned_events",
		event_ids: [message.content], // TODO, should be the event ID of the pinned message
	}),
	GuildMemberJoin: (message) => ({
		membership: "join",
	}),
	ThreadCreated: (message) => ({
		msgtype: "m.thread.create",
		body: "Thread created",
	}),
	Reply: (message) => ({
		msgtype: "m.text",
		body: message.content, // TODO, relation
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: message.reference?.messageId || "", // TODO: needs to be a matrix event ID
			},
		},
		"m.mentions": {
			"user_ids": message.mentions.map(mention => mapUser(mention.id)),
		}
	}),
};

const noMapping = new Set<string>();

function mapUser(user: string): string {
	if (config.mapping[user]) {
		return config.mapping[user].mxid;
	}
	if(!noMapping.has(user)) console.warn(`No mapping found for user ${user}, using original ID`);
	noMapping.add(user);
	return user;
}

function mapRoom(room: string): string {
	if (config.rooms[room]) {
		return config.rooms[room].room_id;
	}
	if(!noMapping.has(room)) console.warn(`No mapping found for room ${room}, using original ID`);
	noMapping.add(room);
	return room;
}

async function translateMessage(message: DiscordChatExportMessage): Promise<ChatExportMessage[]> {
	const base: Partial<ChatExportMessage> = {
		origin_server_ts: new Date(message.timestamp).getTime(),
		event_id: message.id, // the actual event ID will be generated by the server on import, this is just for reference within the same file
		room_id: mapRoom(input.channel.id),
		sender: mapUser(message.author.id),
		type: messageTypes[message.type] || "m.room.message",
		content: {
			...messageContents[message.type]?.(message) || { body: message.content, msgtype: "m.text" },
			"de.importer.imported_from": "discord",
			"de.importer.discord.original_message": message,
		},
	};
	let extra: Partial<ChatExportMessage>[] = [];
	if (message.attachments && message.attachments.length > 0) {
		for (const attachment of message.attachments) {
			extra.push({
				origin_server_ts: new Date(message.timestamp).getTime(),
				room_id: mapRoom(input.channel.id),
				sender: mapUser(message.author.id),
				...await translateAttachment(attachment, message.author.id),
			});
		}
	}
	if (message.reactions && message.reactions.length > 0) {
		for (const reaction of message.reactions) {
			for (const user of reaction.users) {
				extra.push({
					origin_server_ts: new Date(message.timestamp).getTime(),
					room_id: mapRoom(input.channel.id),
					sender: mapUser(user.id),
					type: "m.reaction",
					content: {
						"m.relates_to": {
							event_id: message.id,
							key: reaction.emoji.name,
							rel_type: "m.annotation",
						},
						"de.importer.imported_from": "discord"
					},
				});
			}
		}
	}
	return [base, ...extra] as ChatExportMessage[];
}

const output: ChatExport = {
	room_name: input.channel.name,
	room_creator: input.guild.name,
	export_date: input.exportedAt,
	exported_by: input.guild.name,
	topic: input.channel.topic || "",
	messages: (await Promise.all(input.messages.slice(0, 50).map(translateMessage))).flat(),
};

await writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");
