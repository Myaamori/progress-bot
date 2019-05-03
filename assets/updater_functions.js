/* eslint-disable no-undef */
var socket = io();

console.log("Starting");
var order = ["tl", "tlc", "time", "edit", "ts", "encode", "qc"];
//var [encode], [title], [episode], [time], [tl], [ts], [edit], [qc];

function formatStat(node, command, value) {
	let text;
	if (value == 100) {
		text = command;
		node.classList.add("commandDone");
	} else {
		if (value == 0) {
			text = command;
		} else if (!isNaN(value)) {
			text = command + ": " + value + "%";
		} else {
			text = command + ": " + value;
		}
		node.classList.remove("commandDone");
	}
	node.textContent = text;
}

function formatShowItem(show, stats) {
	let showItem = document.createElement("div");
	showItem.id = show + "-container";

	let title = document.createElement("div");
	title.classList.add("showTitle");
	title.textContent = stats.title;
	showItem.appendChild(title);

	let commandList = document.createElement("div");
	commandList.appendChild(document.createTextNode("» "));
	let episodeItem = document.createElement("span");
	episodeItem.textContent = stats.episode;
	episodeItem.id = show + "-episode";
	commandList.appendChild(episodeItem);
	commandList.appendChild(document.createTextNode(" @ "));

	for (let i = 0; i < order.length; i++) {
		let command = order[i];
		let commandItem = document.createElement("span");
		formatStat(commandItem, command, stats[command]);
		commandItem.id = show + "-" + command;
		commandList.appendChild(commandItem);

		if (i != order.length - 1) {
			commandList.appendChild(document.createTextNode(", "));
		}
	}

	showItem.appendChild(commandList);
	return showItem;
}

socket.on("init-stats", function(val) {
	let showList = document.getElementById("show-list");
	for (const [show, show_stats] of Object.entries(val)) {
		let showItem = formatShowItem(show, show_stats);
		showList.appendChild(showItem);
	}
});


socket.on("update-stats", function(val) {
	console.log("Updating");
	let commandItem = document.getElementById(val.show + "-" + val.command);
	if (val.command == "episode") {
		commandItem.textContent = val.value;
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
	let currentShows = showList.querySelectorAll("div");

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

socket.on("update-users", function(val) {
	$("#totalUsers").text("Users: " + val);
});

socket.on("date-update", function(val) {
	$("#update").text(val);
});
