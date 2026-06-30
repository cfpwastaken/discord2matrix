interface Config {
	homeservers: Record<string, {
		url: string;
		as_token: string;
	}>;
	mapping: Record<string, {
		homeserver: string;
		mxid: string;
	}>;
	rooms: Record<string, {
		room_id: string;
	}>;
}