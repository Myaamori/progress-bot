import config from "./config.js";
import fs from "fs";

//below block is to init stuff. nothing special here
import colors from "colors";

console.log("Initializing Express and HTTP stuff...".green);
import express from "express";

const app = express();
app.use(express.static("assets")); //deliver content in the 'assets' folder

let http = require("http")
	.Server(app);

import {getStats, saveStats, initIo, lastUpdated, validCommands, file } from "./common.js";
let stats = getStats();


//configure in HTTPS mode
if (config.httpsMode) {
	console.log("HTTPS Mode".yellow);
	http = require("https");
	http = http.createServer({
		key: fs.readFileSync(config.httpsKey),
		cert: fs.readFileSync(config.httpsCert)
	}, app);
}

console.log("Initializing Socket.io stuff...".green);

const io = initIo(http); // socket.io for realtime stuff


import jsonFile from "jsonfile"; //because i'm lazy

if (config.enableIrc) {
	let ircClient = require("./irc.js");
	ircClient.initIRC();
}

if (config.enableDiscord) {
	let discordClient = require("./discord.js");
	discordClient.initDiscord();
}

if (config.enableRss) {
	let rssClient = require("./rss.js");
	rssClient.initRSS();
}

console.log("\nINIT COMPLETE\n".bold.magenta);

console.log(colors.grey("%s\n"), JSON.stringify(stats));


app.get("/", (req, res) => {
	res.sendFile(`${__dirname}/index.html`);
});

app.get("/progressbar.min.js", (req, res) => {
	res.sendFile(`${__dirname}/progressbar.min.js`);
});

io.on("connection", socket => {
	console.log("Socket connection established. ID: ".grey, socket.id);

	socket.emit("date-update", lastUpdated);
	socket.emit("init-stats", stats);
	io.emit("update-users", io.engine.clientsCount);

	socket.on("disconnect", socket => {
		io.emit("update-users", io.engine.clientsCount);
	});
});


if (config.httpsMode) {
	http.listen(8443, () => {
		console.log("Listening on port %s in HTTPS mode".bold.yellow, config.httpsPort);
	});
}
else {
	http.listen(config.port, () => {
		console.log("Listening on port %s in HTTP mode".bold.yellow, config.port);
	});
}
//Below stuff is all for clean exits and for uncaught exception handling
process.stdin.resume(); //so the program will not close instantly

function exitHandler({cleanup, exit}, err) {
	if (cleanup) console.log("clean".red);
	if (err) console.log(err.stack);

	saveStats();

	if (exit) process.exit();
}

//do something when app is closing
process.on("exit", exitHandler.bind(null, {
	cleanup: true
}));

//catches ctrl+c event
process.on("SIGINT", exitHandler.bind(null, {
	exit: true
}));

//catches uncaught exceptions
process.on("uncaughtException", exitHandler.bind(null, {
	exit: true
}));



