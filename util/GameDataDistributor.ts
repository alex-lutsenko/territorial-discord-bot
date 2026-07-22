import {WebhookClient} from "discord.js";
import {client} from "../PointManager";
import {sendToFeed} from "./ClaimWinFeed";
import {setClanScore, tryHandlePlayerData} from "./DataPredictions";

let cache: CacheEntry[] = [];
let subscribers: { [key: string]: string[] } = {};

interface CacheEntry {
	clan: string;
	points: number;
	map: string;
	playerCount: number;
	contest: boolean;
	timestamp: number;
}

export function addToCache(data: string) {
	let message = JSON.parse(data).data;
	let match = message.match(/^```\sTime:\s{10}.*\sContest:\s{7}(Yes|No)\sMap:\s{11}([^\n]+)\sPlayer Count:\s{2}(\d+)\sWinning\sClan:\s{2}\[(.*)]\sPrev.\sPoints:\s{1,2}([\d.]+)\sGain:\s{10}([\d.]+)\sCurr.\sPoints:\s{1,2}([\d.]+)\sPayout:[^\n]+\sClan Winners:[^\n]+```$/);
	if (!match) {
		tryHandlePlayerData(message);
		return;
	}
	clearCache();
	setClanScore(match[4], match[7]);

	const msg = `**${match[4]}**    ${match[2]}    ${match[1] === "Yes" ? "2 x " : ""}${parseInt(match[3])}  [${match[5]}->${match[7]}]`;
	sendToSubscribers(match[4], msg);
	sendToSubscribers("ALL", msg);
	sendToFeed(match[4], msg, parseInt(match[3]) * (match[1] === "Yes" ? 2 : 1)).catch(() => {});
	cache.push({
		clan: match[4],
		points: parseInt(match[3]),
		map: match[2],
		playerCount: parseInt(match[3]),
		contest: match[1] === "Yes",
		timestamp: Date.now()
	});
}

function sendToSubscribers(clan: string, message: string) {
	for (const webhook of subscribers[clan] || []) {
		const wh = new WebhookClient({url: webhook});
		wh.send({
			content: message,
			username: client.user?.username,
			avatarURL: client.user?.displayAvatarURL()
		}).catch(() => {});
	}
}

export function subscribe(clan: string, webhook: string) {
	if (!subscribers.hasOwnProperty(clan)) {
		subscribers[clan] = [];
	}
	if (!subscribers[clan].includes(webhook)) {
		subscribers[clan].push(webhook);
	}
}

export function unsubscribe(clan: string, webhook: string) {
	if (subscribers.hasOwnProperty(clan)) {
		subscribers[clan] = subscribers[clan].filter(w => w !== webhook);
	}
}

export function getCacheForClan(clan: string): CacheEntry[] {
	return cache.filter(entry => entry.clan === clan);
}

export function clearCache() {
	cache = cache.filter(entry => entry.timestamp + 300000 > Date.now()); //5 minutes
}