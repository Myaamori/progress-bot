// eslint-disable-next-line no-unused-vars
import colors from "colors";

import Discord from "discord.js";
const client = new Discord.Client();
import config from "./config.js";
import { triggerMatch, runCommand } from "./common.js";

export function initDiscord() {
	client.on("ready", () => {
		console.log(`Logged in as ${client.user.tag}`.yellow);
	});

	let lastUpdated = exports.lastUpdated;

	client.on("message", msg => {
		let authenticated = false;
		
		if (config.discordListenChannels.includes(msg.channel.id))
			authenticated = true;

		if (triggerMatch(msg.content) && authenticated) {
			runCommand(msg.content);
		}
	});

	client.on("error", error => {
		console.log(error);
	});

	client.login(config.discordKey);
}

export function discordSay(message) {
	config.discordNotifyChannels.forEach( async value => {
		let channel = client.channels.get(value);
		await channel.send(message);
	});
}
