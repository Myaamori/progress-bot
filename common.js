import jsonFile from "jsonfile";
import yargs from "yargs";
import config from "./config.js";
import * as ircClient from "./irc.js";
import * as discordClient from "./discord.js";

let ioInstance;

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
export var topLevelRoles = ["episode", "title", "roles", "dateCreated", "dateUpdated"];
export var globalCommands = [
	"add-show", "remove-show", "add-role", "remove-role", "status", "track", "track-stop"
];

function getStats() {
	console.log("Reading existing data...".green);
	const file = `${__dirname}/data.json`;
	var stats;
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

	return stats;
}

export var stats = getStats();
setInterval(saveStats, 1000*60*10); // every 10 minutes

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

export function getEpisodeStatus(show, episode) {
	episode = getEpisode(show, episode);
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

function getEpisode(show, episode) {
	if (episode === undefined) {
		return stats.shows[show].episode;
	} else {
		return episode;
	}
}

function setStat(show, command, value, notifyChange = true, episode) {
	episode = getEpisode(show, episode);

	if (topLevelRoles.includes(command)) {
		stats.shows[show][command] = value;
	} else {
		stats.shows[show].stats[episode][command] = value;
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

function resetValues(show, notifyChange, episode) {
	let roles = stats.shows[show].hasOwnProperty("roles")
		? stats.shows[show].roles
		: Object.keys(defaultRoles);

	episode = getEpisode(show, episode);

	if (!(episode in stats.shows[show].stats)) {
		stats.shows[show].stats[episode] = {};
	}

	let episodeStats = stats.shows[show].stats[episode];
	for (let role of roles) {
		let newValue = role in episodeStats ? episodeStats[role] : 0;
		setStat(show, role, newValue, notifyChange, episode);
	}

	// episode must be reset before calling this bc reasons
	for (let [role, defaultValue] of Object.entries(reservedRoles)) {
		if (role == "episode") {
			continue;
		}

		if (!topLevelRoles.includes(role) && role in episodeStats) {
			defaultValue = episodeStats[role];
		}
		setStat(show, role, defaultValue, notifyChange, episode);
	}
}

export function flattenStats(showStats) {
	let flattened = {...showStats, ...showStats.stats[showStats.episode]};
	delete flattened.stats;
	return flattened;
}

export function runCommand(text, source) {
	const message = getMsg(text);
	let [show, command, ...value] = message.split(" ");
	value = value.join(" ");

	if (stats.shows.hasOwnProperty(show)) {
		try {
			if (command == "roles") {
				setStat(show, command, value.split(" "));

				for (let episode of Object.keys(stats.shows[show].stats)) {
					resetValues(show, episode == stats.shows[show].episode, episode);
				}
				return;
			}

			if (!reservedRoles.hasOwnProperty(command) &&
					!(stats.shows[show].hasOwnProperty("roles") &&
					stats.shows[show].roles.includes(command)) &&
					!(!stats.shows[show].hasOwnProperty("roles") &&
					stats.roles.hasOwnProperty(command))) {
				return;
			}

			let notify = true;
			console.log("Valid command: ".yellow, command, value);
			if (command === "episode") {
				console.log("Resetting everything".yellow);
				setStat(show, "episode", value);
				resetValues(show, true);
			} else {
				const args = yargs.parse(value);
				const episode = getEpisode(show, args.episode);
				value = args._.join(" ");
				notify = episode === getEpisode(show);

				if (!(episode in stats.shows[show].stats)) {
					resetValues(show, false, episode);
				}

				setStat(show, command, value, notify, args.episode);

				// clear message if other status set
				if (command !== "message") {
					setStat(show, "message", "", notify, args.episode);
				}
			}

			if (notify) {
				let replyMessage = getToSay(show, command);
				if (config.enableDiscord && replyMessage) discordClient.discordSay(replyMessage);
				if (config.enableIrc && replyMessage) ircClient.ircSay(replyMessage);

				lastUpdated = new Date().toUTCString();
				ioInstance.emit("date-update", lastUpdated);
			}
		} finally {
			discordClient.updateDiscordTrackers(show);
		}
	} else if (globalCommands.includes(show) && !globalCommands.includes(command)) {
		// interpret first value as command, second as the show to add/remove
		[command, show] = [show, command];

		if (command == "add-show") {
			stats.shows[show] = {title: value, stats: {}, dateCreated: Date.now()};
			setStat(show, "episode", reservedRoles.episode, false);
			resetValues(show, false);
			ioInstance.emit("add-show", {
				"show": show,
				"stats": flattenStats(stats.shows[show])
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
			source.reply(getEpisodeStatus(status, episode));
		} else if (command == "track" && show in stats.shows && source.service == "discord") {
			discordClient.addDiscordTracker(show, source);
		} else if (command == "track-stop" && show in stats.shows && source.service == "discord") {
			discordClient.clearDiscordTracker(show, source);
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
