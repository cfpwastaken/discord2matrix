interface ChatExport {
	room_name: string;
	room_creator: string;
	topic: string;
	export_date: string;
	exported_by: string;
	messages: ChatExportMessage[];
}

interface ChatExportMessage {
	event_id: string;
	origin_server_ts: number;
	room_id: string;
	sender: string;
	state_key: string;
	type: string;
	unsigned: object;
	content: object;
}
