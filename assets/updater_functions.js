/* eslint-disable no-undef */

const port = document.getElementById("show-list").dataset.port || window.location.port;
var socket = io(window.location.protocol + "//" + window.location.hostname + ":" + port);

console.log("Starting");
var order = ["tl", "tlc", "time", "edit", "ts", "encode", "qc"];
//var [encode], [title], [episode], [time], [tl], [ts], [edit], [qc];

function formatStat(node, command, value) {
	let text;
	if (value == 100) {
		text = command;
		node.style.textDecoration = "line-through";
	} else {
		if (value == 0) {
			text = command;
		} else if (!isNaN(value)) {
			text = command + ": " + value + "%";
		} else {
			text = command + ": " + value;
		}
		node.style.textDecoration = "none";
	}
	node.textContent = text;
}

function formatShowItem(show, stats) {
	let showItem = document.createElement("p");
	showItem.id = show + "-container";

	let title = document.createElement("div");
	title.style.fontWeight = "bold";
	title.textContent = stats.title;
	showItem.appendChild(title);

	let commandList = document.createElement("div");
	commandList.appendChild(document.createTextNode("» "));
	let episodeItem = document.createElement("span");
	episodeItem.textContent = stats.episode;
	episodeItem.id = show + "-episode";
	commandList.appendChild(episodeItem);
	commandList.appendChild(document.createTextNode(" @ "));

	let commands = document.createElement("span");
	commands.id = show + "-commands";
	for (let i = 0; i < order.length; i++) {
		let command = order[i];
		let commandItem = document.createElement("span");
		formatStat(commandItem, command, stats[command]);
		commandItem.id = show + "-" + command;
		commands.appendChild(commandItem);

		if (i != order.length - 1) {
			commands.appendChild(document.createTextNode(", "));
		}
	}
	let showMessage = "message" in stats && stats.message != "";
	commands.style.display = showMessage ? "none" : "inline";

	let message = document.createElement("span");
	message.id = show + "-message";
	message.textContent = stats.message;
	message.style.display = showMessage ? "inline" : "none";

	commandList.appendChild(commands);
	commandList.appendChild(message);
	showItem.appendChild(commandList);
	return showItem;
}

socket.on("init-stats", function(val) {
	let showList = document.getElementById("show-list");
	while (showList.childNodes.length > 0) {
		showList.removeChild(showList.firstChild);
	}

	for (const [show, show_stats] of Object.entries(val)) {
		let showItem = formatShowItem(show, show_stats);
		showList.appendChild(showItem);
	}
});


socket.on("update-stats", function(val) {
	console.log("Updating");
	let commandItem = document.getElementById(val.show + "-" + val.command);
	if (val.command == "episode" || val.command == "message") {
		commandItem.textContent = val.value;

		if (val.command == "message") {
			let commands = document.getElementById(val.show + "-commands");
			commands.style.display = val.value == "" ? "inline" : "none";
			let message = document.getElementById(val.show + "-message");
			message.style.display = val.value == "" ? "none" : "inline";
		}
	} else {
		formatStat(commandItem, val.command, val.value);
	}
});

socket.on("add-show", function(val) {
	let showList = document.getElementById("show-list");
	let prevShowItem = document.getElementById(val.show + "-container");
	if (prevShowItem !== null) {
		prevShowItem.parentNode.removeChild(prevShowItem);
	}

	let showItem = formatShowItem(val.show, val.stats);
	let currentShows = showList.querySelectorAll("p");

	if (currentShows.length == 0) {
		showList.appendChild(showItem);
	} else {
		showList.insertBefore(showItem, showList.childNodes[0]);
	}
});

socket.on("remove-show", function(show) {
	let showItem = document.getElementById(show + "-container");
	showItem.parentNode.removeChild(showItem);
});
