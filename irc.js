import irc from "irc-upd";
import config from "./config.js";
import * as common from "./common.js";

let bot;

export function initIRC() {
	console.log("Connecting to IRC...".green);

	if (config.identify && !config.nick_secret) {
		let pass_prompt = require("password-prompt");
		pass_prompt("ENTER PASSWORD AT ANY TIME").then(function(password) {
			config.nick_secret = password;
			init();
		});
	} else {
		init();
	}
}

function init() {
	let ircConfig = {
		channels: config.channels,
		userName: config.userName || config.botName,
		realName: config.realName || config.botName
	};

	if (config.identify && config.sasl) {
		console.log("Identifying with SASL".yellow);
		ircConfig.sasl = true;
		ircConfig.password = config.nick_secret;
	}

	bot = new irc.Client(config.server, config.botName, ircConfig);
	console.log("Connected!".yellow);

	if (config.identify && !config.sasl) {
		bot.addListener('registered', (message) => {
			console.log("Identifying with NickServ".yellow);
			bot.say(config.nickserv, `identify ${config.nick_secret}`);
		})
	}

	console.log("Adding listener for trigger...".green);
	/**
	 * Below block is for listening to a specific trigger word.
	 */
	bot.addListener('message', (from, to, text, message) => {
		//extract the first n characters from each message and check if it matches the trigger word
		if (config.listenChannel.includes(to) && common.triggerMatch(text)) {
			//if we have a matching trigger, extract the command the value
			common.runCommand(text, {
				service: "irc",
				reply: m => bot.say(to, ircify(m))
			});
		}
	});

	bot.addListener("error", message => {
		console.log("IRC Error ".red, message);
	});

}

export function ircSay(message) {
	if (message){
		message = ircify(message);
		for (let i = 0; i < config.notifyChannel.length; i++) {
			bot.say(config.notifyChannel[i], message);
		}
	}
}

function ircify(message) {
	return message.replace(/<\/?b>/g, "\x02").replace(/<\/?i>/g, "\x1D").replace(/<\/?s>/g, "\x1E");
}
