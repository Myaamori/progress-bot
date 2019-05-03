import jsonFile from "jsonfile";
import config from "./config.js";
import { ircSay } from "./irc.js";
import { discordSay } from "./discord.js";

let ioInstance;
let stats;

export function initIo(http) {
	ioInstance = require("socket.io")(http);
	return ioInstance;
}

export function io() {
	return ioInstance;
}

export var lastUpdated = new Date().toUTCString();
export var validCommands = ["encode", "tlc", "episode", "time", "tl", "ts", "edit", "qc"];
export var globalCommands = ["add-show", "remove-show"];

export function getStats() {
	if (!stats){
		console.log("Reading existing data...".green);
		const file = `${__dirname}/data.json`;
		try {
			stats = jsonFile.readFileSync(file);
		}
		catch (err) {
			if (err.code === "ENOENT") {
				//If no data file was found, start with dummy data
				console.log("No default data file found".yellow);
				console.log("Creating dummy data".yellow);
				stats = {};
			}
		}
	}
	return stats;
}

export var file = `${__dirname}/data.json`;

export function triggerMatch(text) {
	return text.substring(0, config.trigger.length) === config.trigger;
}

export function getMsg(text) {
	return text.substring(config.trigger.length);
}

function getProgress(value) {
	// don't add % if not a valid number
	if (isNaN(value)) {
		return value;
	}
	else {
		return value + '%';
	}
}

export function getIRCtoSay(show, command) {
	if (command === "episode") {
		return `Currently working on \u0002${stats[show].title}\u0002 ` +
			`episode ${stats[show].episode}`;
	}
	else {
		return `\u0002${stats[show].title}\u0002 | Episode ${stats[show].episode} | ` +
			`${capitalizeFirst(command)} progress @ ${getProgress(stats[show][command])}`;
	}
}

export function getDiscordtoSay(show, command) {
	if (command === "episode") {
		return `Currently working on **${stats[show].title}** episode ${stats[show].episode}`;
	}
	else {
		return `**${stats[show].title}** | Episode ${stats[show].episode} | ` +
			`${capitalizeFirst(command)} progress @ ${getProgress(stats[show][command])}`;
	}
}

function setStat(show, command, value) {
	stats[show][command] = value;
	ioInstance.emit("update-stats", {
		"show": show,
		"command": command,
		"value": value
	});
}

export function runCommand(text) {
	const message = getMsg(text);
	let [show, command, ...value] = message.split(" ");
	value = value.join(" ");

	if (stats.hasOwnProperty(show)) {
		if (!validCommands.includes(command)) {
			return;
		}

		console.log("Valid command: ".yellow, command, value);
		if (command === "episode") {
			console.log("Resetting everything".yellow);
			for (const key of validCommands) {
				setStat(show, key, key == "episode" ? value : 0);
			}
		} else {
			setStat(show, command, value);
		}

		let discordMessage = getDiscordtoSay(show, command);
		let ircMessage = getIRCtoSay(show, command);
		if (config.enableDiscord) discordSay(discordMessage);
		if (config.enableIrc) ircSay(ircMessage);

		lastUpdated = new Date().toUTCString();
		ioInstance.emit("date-update", lastUpdated);
	} else if (globalCommands.includes(show) && !globalCommands.includes(command)) {
		// interpret first value as command, second as the show to add/remove
		[show, command] = [command, show];
		if (command == "add-show") {
			stats[show] = {title: value};
			for (const cmd of validCommands) {
				stats[show][cmd] = 0;
			}
			ioInstance.emit("add-show", {
				"show": show,
				"stats": stats[show]
			});
		} else if (command == "remove-show") {
			delete stats[show];
			ioInstance.emit("remove-show", show);
		}
	}
}

function capitalizeFirst(string) {
	if (string.length > 3) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}
	else {
		return string.toUpperCase();
	}
}
