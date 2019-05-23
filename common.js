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
// available base roles (default value 0)
export var defaultRoles = {
	encode: "Encode", tlc: "Translation Checking", time: "Timing",
	tl: "Translation", ts: "Typesetting", edit: "Edit", qc: "Quality Control"
};
// non-customizable roles + default values
export var specialRoles = {episode: "0/?", message: ""};
export var globalCommands = ["add-show", "remove-show", "add-role", "remove-role"];

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

		if (!("roles" in stats)) {
			stats.roles = defaultRoles;
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
	if (command === "episode" && config.sendEpisodeMessage) {
		return `Currently working on \u0002${stats[show].title}\u0002 ` +
			`episode ${stats[show].episode}`;
	}
	else if (command !== "message" && command !== "episode") {
		return `\u0002${stats[show].title}\u0002 | Episode ${stats[show].episode} | ` +
			`${capitalizeFirst(command)} progress @ ${getProgress(stats[show][command])}`;
	}
	else {
		return null;
	}
}

export function getDiscordtoSay(show, command) {
	if (command === "episode" && config.sendEpisodeMessage) {
		return `Currently working on **${stats[show].title}** episode ${stats[show].episode}`;
	}
	else if (command !== "message" && command !== "episode") {
		return `**${stats[show].title}** | Episode ${stats[show].episode} | ` +
			`${capitalizeFirst(command)} progress @ ${getProgress(stats[show][command])}`;
	}
	else {
		return null;
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

function resetValues(show, notifyChange) {
	let roles = stats[show].hasOwnProperty("roles") ? stats[show].roles : Object.keys(defaultRoles);
	for (let role of roles) {
		if (notifyChange) {
			setStat(show, role, 0);
		} else {
			stats[show][role] = 0;
		}
	}

	for (let [role, defaultValue] of Object.entries(specialRoles)) {
		if (notifyChange) {
			setStat(show, role, defaultValue);
		} else {
			stats[show][role] = defaultValue;
		}
	}
}

export function runCommand(text) {
	const message = getMsg(text);
	let [show, command, ...value] = message.split(" ");
	value = value.join(" ");

	if (stats.hasOwnProperty(show)) {
		if (command == "roles") {
			setStat(show, command, value.split(" "));
			stats[show].roles.forEach(x => setStat(show, x, 0));
			return;
		}

		if (!specialRoles.hasOwnProperty(command) &&
				!(stats[show].hasOwnProperty("roles") && stats[show].roles.includes(command)) &&
				!(!stats[show].hasOwnProperty("roles") && stats.roles.hasOwnProperty(command))) {
			return;
		}

		console.log("Valid command: ".yellow, command, value);
		if (command === "episode") {
			console.log("Resetting everything".yellow);
			resetValues(show, true);
			setStat(show, "episode", value);
		} else {
			setStat(show, command, value);

			// clear message if other status set
			if (command !== "message") {
				setStat(show, "message", "");
			}
		}

		let discordMessage = getDiscordtoSay(show, command);
		let ircMessage = getIRCtoSay(show, command);
		if (config.enableDiscord && discordMessage) discordSay(discordMessage);
		if (config.enableIrc && ircMessage) ircSay(ircMessage);

		lastUpdated = new Date().toUTCString();
		ioInstance.emit("date-update", lastUpdated);
	} else if (globalCommands.includes(show) && !globalCommands.includes(command)) {
		// interpret first value as command, second as the show to add/remove
		[command, show] = [show, command];
		if (command == "add-show") {
			stats[show] = {title: value};
			resetValues(show, false);
			ioInstance.emit("add-show", {
				"show": show,
				"stats": stats[show]
			});
		} else if (command == "remove-show") {
			delete stats[show];
			ioInstance.emit("remove-show", show);
		} else if (command == "add-role") {
			stats.roles[show] = value;
			ioInstance.emit("add-role", {
				"role": show,
				"value": value
			});
		} else if (command == "remove-role") {
			delete stats.roles[show];
			ioInstance.emit("remove-role", show);
		}
	}
}

function capitalizeFirst(string) {
	if (stats.roles[string]) {
		return stats.roles[string];
	}
	else if (string.length > 3) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}
	else {
		return string.toUpperCase();
	}
}
