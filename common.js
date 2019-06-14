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
export var defaultOrder = ["tl", "tlc", "time", "edit", "ts", "encode", "qc"];
// non-customizable roles + default values
export var reservedRoles = {episode: "0/?", message: ""};
export var topLevelRoles = ["episode", "dateCreated", "dateUpdated"];
export var globalCommands = ["add-show", "remove-show", "add-role", "remove-role", "status"];

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

		if (!("shows" in stats)) {
			stats.shows = {};

			for (const [show, show_stats] of Object.entries(stats)) {
				if (show == "roles" || show == "shows") {
					continue;
				}

				show_stats.stats = {}
				show_stats.stats[show_stats.episode] = {}
				for (const [role, value] of Object.entries(show_stats)) {
					if (role == "episode" || role == "stats" || role == "roles" || role == "title") {
						continue;
					}

					show_stats.stats[show_stats.episode][role] = value;
					delete show_stats[role];
				}

				show_stats.dateCreated = Date.now();
				show_stats.dateUpdated = Date.now();
				stats.shows[show] = show_stats;
				delete stats[show];
			}
		}

		setInterval(saveStats, 1000*60*10); // every 10 minutes
	}
	return stats;
}

export function saveStats() {
	jsonFile.writeFileSync(file, stats);
	console.log("Saving stats to disk".yellow);
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

export function getToSay(show, command) {
	if (command === "episode" && config.sendEpisodeMessage) {
		return `Currently working on <b>${stats.shows[show].title}</b> ` +
			`episode ${stats.shows[show].episode}`;
	}
	else if (command !== "message" && command !== "episode") {
		const show_stats = stats.shows[show].stats[stats.shows[show].episode];
		return `<b>${stats.shows[show].title}</b> | Episode ${stats.shows[show].episode} | ` +
			`${capitalizeFirst(command)} progress @ ${getProgress(show_stats[command])}`;
	}
	else {
		return null;
	}
}

function getEpisodeStatus(status) {
	let roleStatus = Array.from(status.stats.entries()).map(([role, value]) => {
		let progress = getProgress(value);
		if (progress == '0%') {
			return role;
		} else if (progress == "100%") {
			return `<s>${role}</s>`;
		} else {
			return `${role}: ${progress}`;
		}
	}).join(", ");
	return `<b>${status.title}</b> | Episode ${status.episode} | ${roleStatus}`;
}

function setStat(show, command, value, notifyChange = true) {
	if (topLevelRoles.includes(command)) {
		stats.shows[show][command] = value;
	} else {
		stats.shows[show].stats[stats.shows[show].episode][command] = value;
	}

	if (notifyChange) {
		ioInstance.emit("update-stats", {
			"show": show,
			"command": command,
			"value": value
		});
	}

	stats.shows[show].dateUpdated = Date.now();
}

function resetValues(show, notifyChange) {
	let roles = stats.shows[show].hasOwnProperty("roles")
		? stats.shows[show].roles
		: Object.keys(defaultRoles);

	for (let role of roles) {
		setStat(show, role, 0, notifyChange);
	}

	// episode must be reset before calling this bc reasons
	for (let [role, defaultValue] of Object.entries(reservedRoles)) {
		if (role == "episode") {
			continue;
		}
		setStat(show, role, defaultValue, notifyChange);
	}
}

export function runCommand(text, source) {
	const message = getMsg(text);
	let [show, command, ...value] = message.split(" ");
	value = value.join(" ");

	if (stats.shows.hasOwnProperty(show)) {
		if (command == "roles") {
			setStat(show, command, value.split(" "));
			stats.shows[show].roles.forEach(x => setStat(show, x, 0));
			return;
		}

		if (!reservedRoles.hasOwnProperty(command) &&
				!(stats.shows[show].hasOwnProperty("roles") &&
				  stats.shows[show].roles.includes(command)) &&
				!(!stats.shows[show].hasOwnProperty("roles") &&
				  stats.roles.hasOwnProperty(command))) {
			return;
		}

		console.log("Valid command: ".yellow, command, value);
		if (command === "episode") {
			console.log("Resetting everything".yellow);
			setStat(show, "episode", value);
			resetValues(show, true);
		} else {
			setStat(show, command, value);

			// clear message if other status set
			if (command !== "message") {
				setStat(show, "message", "");
			}
		}

		let replyMessage = getToSay(show, command);
		if (config.enableDiscord && replyMessage) discordSay(replyMessage);
		if (config.enableIrc && replyMessage) ircSay(replyMessage);

		lastUpdated = new Date().toUTCString();
		ioInstance.emit("date-update", lastUpdated);
	} else if (globalCommands.includes(show) && !globalCommands.includes(command)) {
		// interpret first value as command, second as the show to add/remove
		[command, show] = [show, command];

		if (command == "add-show") {
			stats.shows[show] = {title: value, dateCreated: Date.now()};
			setStat(show, "episode", reservedRoles.episode, false);
			resetValues(show, false);
			ioInstance.emit("add-show", {
				"show": show,
				"stats": stats.shows[show]
			});
		} else if (command == "remove-show") {
			delete stats.shows[show];
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
		} else if (command == "status" && show in stats.shows) {
			let episode = value.length != '' ? value : stats.shows[show].episode;
			let episodeStats = stats.shows[show].stats[episode];
			if (episodeStats === undefined) {
				return;
			}

			let roles = stats.shows[show].roles || defaultOrder;

			let status = {
				title: stats.shows[show].title,
				episode: stats.shows[show].episode,
				stats: new Map(roles.map(x => [x, episodeStats[x]]))
			}

			source.reply(getEpisodeStatus(status));
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
