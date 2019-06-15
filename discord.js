// eslint-disable-next-line no-unused-vars
import colors from "colors";

import Discord from "discord.js";
const client = new Discord.Client();
import config from "./config.js";
import { triggerMatch, runCommand, getEpisodeStatus, getStats } from "./common.js";

export function initDiscord() {
	client.on("ready", () => {
		console.log(`Logged in as ${client.user.tag}`.yellow);
	});

	let lastUpdated = exports.lastUpdated;

	client.on("message", msg => {
		let authenticated = config.discordListenChannels.includes(msg.channel.id) ||
			(msg.channel.parent &&
				config.discordListenCategories.includes(msg.channel.parent.id));

		if (triggerMatch(msg.content) && authenticated) {
			runCommand(msg.content, {
				service: "discord",
				reply: m => msg.channel.send(discordify(m)),
				message: msg
			});
		}
	});

	client.on("error", error => {
		console.log(error);
	});

	client.login(config.discordKey);
}

export function discordSay(message) {
	message = discordify(message);
	config.discordNotifyChannels.forEach( async value => {
		let channel = client.channels.get(value);
		await channel.send(message);
	});
}

function discordify(message) {
	return message.replace(/<\/?b>/g, "**").replace(/<\/?i>/g, "*").replace(/<\/?s>/g, "~~");
}

let stats = getStats();

export function addDiscordTracker(show, source) {
	if (!("discordTrackers" in stats.shows[show])) {
		stats.shows[show].discordTrackers = {};
	}

	source.reply(getEpisodeStatus(show))
		.then(msg => {
			stats.shows[show].discordTrackers[msg.channel.id] = msg.id;
		}).catch(error => source.reply("Failed to send message."));
}

export function clearDiscordTracker(show, source) {
	if ("discordTrackers" in stats.shows[show]) {
		delete stats.shows[show].discordTrackers[source.message.channel.id];
	}
}

export function updateDiscordTrackers(show) {
	let status = discordify(getEpisodeStatus(show));

	if ("discordTrackers" in stats.shows[show]) {
		for (const [channelId, msgId] of Object.entries(stats.shows[show].discordTrackers)) {
			let channel = client.channels.get(channelId);
			if (channel !== undefined) {
				channel.fetchMessage(msgId).then(msg => msg.edit(status));
			}
		}
	}
}
