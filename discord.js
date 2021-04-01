// eslint-disable-next-line no-unused-vars
import colors from "colors";

import Discord from "discord.js";
const client = new Discord.Client();
import config from "./config.js";
import * as common from "./common.js";

export function initDiscord() {
	client.on("ready", () => {
		console.log(`Logged in as ${client.user.tag}`.yellow);
	});

	let lastUpdated = exports.lastUpdated;

	client.on("message", msg => {
		let authenticated = config.discordListenChannels.includes(msg.channel.id) ||
			(msg.channel.parent &&
				config.discordListenCategories.includes(msg.channel.parent.id));

		if (common.triggerMatch(msg.content) && authenticated) {
			common.runCommand(msg.content, {
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
		let channel = await client.channels.fetch(value);
		await channel.send(message);
	});
}

function discordify(message) {
	return message.replace(/<\/?b>/g, "**").replace(/<\/?i>/g, "*").replace(/<\/?s>/g, "~~");
}

export function addDiscordTracker(show, source, topic = false) {
	if (!("discordTrackers" in common.stats.shows[show])) {
		common.stats.shows[show].discordTrackers = {};
	}

	if (topic) {
		source.message.channel.setTopic(discordify(common.getEpisodeStatus(show)))
			.then(channel => {
				common.stats.shows[show].discordTrackers[channel.id] = "topic";
			}).catch(error => source.reply("Failed to set channel topic: " + error.message))
	} else {
		source.reply(common.getEpisodeStatus(show))
			.then(msg => {
				common.stats.shows[show].discordTrackers[msg.channel.id] = msg.id;
			}).catch(error => source.reply("Failed to send message: " + error.message));
	}
}

export function clearDiscordTracker(show, source) {
	if ("discordTrackers" in common.stats.shows[show]) {
		delete common.stats.shows[show].discordTrackers[source.message.channel.id];
	}
}

export function updateDiscordTrackers(show) {
	let status = discordify(common.getEpisodeStatus(show));

	if ("discordTrackers" in common.stats.shows[show]) {
		for (const [channelId, msgId] of Object.entries(common.stats.shows[show].discordTrackers)) {
			client.channels.fetch(channelId).then(channel => {
				if (msgId === "topic") {
					channel.setTopic(status)
				} else {
					channel.messages.fetch(msgId).then(msg => msg.edit(status));
				}
			})
		}
	}
}
