import jsonFile from "jsonfile";
import Yargs from "yargs/yargs";
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
export var reservedRoles = {message: ""};
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
	if (command === "episode") {
		return `Currently working on <b>${stats.shows[show].title}</b> ` +
			`episode ${stats.shows[show].episode}`;
	}
	else if (command !== "message") {
		const show_stats = stats.shows[show].stats[stats.shows[show].episode];
		return `<b>${stats.shows[show].title}</b> | Episode ${stats.shows[show].episode} | ` +
			`${capitalizeFirst(command)} progress @ ${getProgress(show_stats[command])}`;
	}
	else {
		return null;
	}
}

export function getEpisodeStatus(show, episode, highlightRole) {
	episode = getEpisode(show, episode);
	let episodeStats = stats.shows[show].stats[episode];
	if (episodeStats === undefined) {
		return;
	}

	let roles = stats.shows[show].roles || defaultOrder;

	let status = {
		title: stats.shows[show].title,
		episode: episode,
		stats: new Map(roles.map(x => [x, episodeStats[x]]))
	}

	let roleStatus = Array.from(status.stats.entries()).map(([role, value]) => {
		let progress = getProgress(value);
		let text = progress == '0%'
			? role
			: progress == '100%'
				? `<s>${role}</s>`
				: `${role}: ${progress}`;

		if (role === highlightRole) {
			return `<b>${text}</b>`;
		} else {
			return text;
		}
	}).join(", ");
	return `<b>${status.title}</b> | Episode ${status.episode} | ${roleStatus}`;
}

function getEpisode(show, episode) {
	return !episode ? stats.shows[show].episode : episode;
}

function setStat(show, command, value, episode) {
	episode = getEpisode(show, episode);
	stats.shows[show].stats[episode][command] = value;

	if (episode === getEpisode(show)) {
		ioInstance.emit("update-stats", {
			"show": show,
			"command": command,
			"value": value
		});
	}

	stats.shows[show].dateUpdated = Date.now();
}

function resetValues(show, episode) {
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
		setStat(show, role, newValue, episode);
	}

	// episode must be reset before calling this bc reasons
	for (let [role, defaultValue] of Object.entries(reservedRoles)) {
		let newValue = role in episodeStats ? episodeStats[role] : defaultValue;
		setStat(show, role, newValue, episode);
	}
}

export function flattenStats(showStats) {
	let flattened = {...showStats, ...showStats.stats[showStats.episode]};
	delete flattened.stats;
	return flattened;
}

function notify(show, command) {
	let ircMessage = getToSay(show, command)
	let discordMessage = getEpisodeStatus(show, false, command);
	if (config.enableDiscord && ircMessage) discordClient.discordSay(discordMessage);
	if (config.enableIrc && ircMessage) ircClient.ircSay(ircMessage);

	lastUpdated = new Date().toUTCString();
	ioInstance.emit("date-update", lastUpdated);
}

class CommandError extends Error {}

function command(f) {
	return (...args) => {
		if (args.length != f.length) {
			throw new CommandError("Wrong length");
		} else {
			f(...args);
		}
	};
}

function vCommand(f) {
	return (...args) => {
		if (args.length <= f.length) {
			throw new CommandError("Wrong length");
		} else {
			f(...args);
		}
	}
}

function yargsCommand(spec, builder, f) {
	return (...args) => {
		Yargs()
			.command(spec, '', builder, f)
			.strict()
			.fail((msg, err, yargs) => {
				throw new CommandError(msg)
			})
			.parse(args);
	}
}

function parse(args, spec) {
	if (args.length == 0 || args[0] == "*") {
		throw new CommandError("Missing command");
	} else {
		if (args[0] in spec) {
			spec[args[0]](...args.slice(1));
		} else if (spec["*"]) {
			spec["*"](...args)
		} else {
			throw new CommandError("No matching command")
		}
	}
}

export function runCommand(text, source) {
	const message = getMsg(text);

	function errorHandler(err, argv, output) {
		if (err) {
			source.reply("Error: " + err.message);
		}
	}

	const args = message.trim().split(/\s+/)

	try {
		parse(args, {
			"*": (show, ...tail) => {
				if (!(show in stats.shows)) {
					throw new CommandError(`No such show: ${show}`);
				}
				let episode = null;
				let changedRole = null;

				parse(tail, {
					"episode": vCommand((...description) => {
						let episode = description.join(" ");
						stats.shows[show].episode = episode;
						ioInstance.emit("update-stats", {
							"show": show,
							"command": "episode",
							"value": episode
						});

						resetValues(show);

						if (config.sendEpisodeMessage) {
							notify(show, "episode");
						}
					}),
					"roles": vCommand((...roles) => {
						stats.shows[show].roles = roles;
						ioInstance.emit("update-stats", {
							"show": show,
							"command": "roles",
							"value": roles
						});

						for (let ep of Object.keys(stats.shows[show].stats)) {
							resetValues(show, ep);
						}
					}),
					"*": yargsCommand("* <role> <value..>", (yargs) => {
						yargs.option("episode", {string: true})
					}, (argv) => {
						let roles = "roles" in stats.shows[show]
							? stats.shows[show].roles
							: Object.keys(stats.roles);
						if (!roles.includes(argv.role) && !(argv.role in reservedRoles)) {
							throw new CommandError(`No such role for ${show}: ${argv.role}`);
						}

						episode = getEpisode(show, argv.episode);
						const value = argv.value.join(" ");

						if (!(episode in stats.shows[show].stats)) {
							resetValues(show, episode);
						}

						setStat(show, argv.role, value, argv.episode);
						changedRole = argv.role;

						// clear message if other status set
						if (argv.role !== "message") {
							setStat(show, "message", "", argv.episode);
						}

						if (episode === getEpisode(show)) {
							notify(show, argv.role);
						}
					})
				})

				discordClient.updateDiscordTrackers(show);

				if (config.replyStatus) {
					source.reply(getEpisodeStatus(show, episode, changedRole));
				}
			},
			"add-show": vCommand((show, ...name) => {
				stats.shows[show] = {
					title: name.join(" "),
					stats: {},
					episode: "01",
					dateCreated: Date.now()
				};

				resetValues(show);
				ioInstance.emit("add-show", {
					"show": show,
					"stats": flattenStats(stats.shows[show])
				});

				source.reply(`Added show: ${show} - ${stats.shows[show].title}`);
			}),
			"remove-show": command((show) => {
				delete stats.shows[show];
				ioInstance.emit("remove-show", show);
				source.reply(`Removed show: ${show}`);
			}),
			"add-role": vCommand((role, ...description) => {
				stats.roles[role] = description.join(" ");
				ioInstance.emit("add-role", {
					"role": role,
					"value": stats.roles[role]
				});
				source.reply(`Added role description for ${role}: ${stats.roles[role]}`)
			}),
			"remove-role": command((role) => {
				delete stats.roles[role];
				ioInstance.emit("remove-role", role);
				source.reply(`Removed role description for ${role}`);
			}),
			"track": yargsCommand("* <show>", (yargs) => {
				yargs.option("topic", {boolean: true})
			}, (argv) => {
				if (argv.show in stats.shows && source.service == "discord") {
					discordClient.addDiscordTracker(argv.show, source, argv.topic);
				} else if (source.service != "discord") {
					throw new CommandError("Tracking only supported from Discord");
				} else {
					throw new CommandError(`No such show: ${argv.show}`)
				}
			}),
			"track-stop": command((show) => {
				if (show in stats.shows && source.service == "discord") {
					discordClient.clearDiscordTracker(show, source);
				} else if (source.service != "discord") {
					throw new CommandError("Tracking only supported from Discord");
				} else {
					throw new CommandError(`No such show: ${show}`);
				}
			}),
			"status": yargsCommand("* <show> [episode]", () => {}, (argv) => {
				if (argv.show in stats.shows) {
					let episode = getEpisode(argv.show, argv.episode);
					let status = getEpisodeStatus(argv.show, argv.episode);
					if (status) {
						source.reply(status);
					} else {
						throw new CommandError(`No such episode for ${argv.show}: ${episode}`);
					}
				} else {
					throw new CommandError(`No such show: ${argv.show}`);
				}
			})
		})
	} catch (e) {
		if (e instanceof CommandError) {
			source.reply("Error: " + e.message);
		} else {
			throw e;
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
