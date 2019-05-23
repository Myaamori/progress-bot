// eslint-disable-next-line no-unused-vars

const Parser = require("rss-parser");
const parser = new Parser();
import config from "./config.js";
import { runCommand } from "./common.js";
import { ircSay } from "./irc.js";
import { discordSay } from "./discord.js";

let lastUpdated = new Date(0);

export function initRSS() {
	parser.parseURL(config.rssFeed).then((feed) => {
		for (let item of feed.items) {
			const pubDate = new Date(item.pubDate);
			if (pubDate > lastUpdated) {
				lastUpdated = pubDate;
			}
		}

		setInterval(readRSS, config.rssInterval * 1000);
	}, (error) => {
		console.log("Initializing RSS feeds failed.".red);
		console.log(error);
	})
}

function getIRCMessage(item) {
	return `New post: \u0002${item.title}\u0002 | ${item.link}`;
}

function getDiscordMessage(item) {
	return `New post: **${item.title}** | ${item.link}`;
}

function readRSS() {
	parser.parseURL(config.rssFeed).then((feed) => {
		let tmpLastUpdated = lastUpdated;
		for (let item of feed.items) {
			const pubDate = new Date(item.pubDate);
			if (pubDate > lastUpdated) {
				if (pubDate > tmpLastUpdated) {
					tmpLastUpdated = pubDate;
				}
				if (config.enableIrc) ircSay(getIRCMessage(item));
				if (config.enableDiscord) discordSay(getDiscordMessage(item));
			}
		}
		lastUpdated = tmpLastUpdated;
	}, (error) => {
		console.log(error);
	});
}
