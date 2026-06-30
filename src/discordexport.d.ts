interface DiscordChatExport {
	guild: {
		id: string;
		name: string;
		iconUrl: string;
	},
	channel: {
		id: string;
		type: string;
		categoryId: string | null;
		category: string | null;
		name: string;
		topic: string | null;
	},
	dateRange: {
		after: number | null;
		before: number | null;
	},
	exportedAt: string;
	messages: DiscordChatExportMessage[];
}

type DiscordMessageType = "Default" | "RecipientAdd" | "RecipientRemove" | "Call" | "ChannelNameChange" | "ChannelIconChange" | "ChannelPinnedMessage" | "GuildMemberJoin" | "ThreadCreated" | "Reply";

interface DiscordChatExportMessage {
	id: string;
	type: DiscordMessageType;
	timestamp: string;
	timestampEdited: string | null;
	callEndedTimestamp: string | null;
	isPinned: boolean;
	content: string;
	author: DiscordChatExportAuthor;
	reference?: {
		messageId: string;
		channelId: string;
		guildId: string;
	}
	reactions: DiscordChatExportReaction[];
	mentions: DiscordChatExportAuthor[];
	attachments: DiscordChatExportAttachment[];
}

interface DiscordChatExportAuthor {
	id: string;
	name: string;
	discriminator: string;
	nickname: string | null;
	color: string;
	isBot: boolean;
	avatarUrl: string;
}

interface DiscordChatExportEmoji {
	id: string;
	name: string;
	code: string;
	isAnimated: boolean;
	imageUrl: string;
}

interface DiscordChatExportReaction {
	emoji: DiscordChatExportEmoji;
	count: number;
	users: DiscordChatExportAuthor[];
}

interface DiscordChatExportAttachment {
	id: string;
	url: string;
	fileName: string;
	fileSizeBytes: number;
}
