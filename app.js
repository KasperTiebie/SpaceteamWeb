//Initilization for express
var express = require('express');
var app = express();
var serv = require('http').Server(app);

var fs = require('fs');
var names = JSON.parse(fs.readFileSync('names.json', 'utf8'));

//If no directory is giving in the URL, redirect to client.html
app.get('/', function(req, res){
	res.sendFile(__dirname + '/client/index.html');
});

//Makes sure the client can only use/see files in the /client directory
app.use('/client', express.static(__dirname + '/client'));

//LISTEN UP HERE'S A STORY
serv.listen(2000); //Port 2000
console.log("Server started succesfully!");

//Declare some arrays and stuff
var ROOM_LIST = []; //Used to store all the rooms
var SOCKET_LIST = []; //Used to store all the connection (used when sending/receiving data from specific connections)
var PLAYER_DATA = {}; //Used to store all the players (all the player's data instead of the connection data)

function createPlayer(id){

	var self = { //Used to store all the players data
		id: id,
		room: null,
		health: null
	}

	PLAYER_DATA[id] = self; //Adds it to the PLAYER_DATA ARRAY with the same ID used for the socket (socket.id)
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){

	console.log("New Socket Connection");

	//Give the socket a random id and add it to the socket array
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;

	createPlayer(socket.id);

	//Ads an event listener for if the player disconnects
	socket.on('disconnect', function(){
		leaveRoom(socket);

		delete SOCKET_LIST[socket.id];
		delete PLAYER_DATA[socket.id];
	});

	socket.on('createRoom', function(){
		//If the player's already in a room
		if(PLAYER_DATA[socket.id].room !== null){
			var errorMessage = "You're already in a room!";
			socket.emit('alert', errorMessage);
			return true;
		}

		//Creates the room
		var roomID = createRoomId(socket);

		PLAYER_DATA[socket.id].room = roomID; //Changes the room in PLAYER_DATA to the room id
		socket.emit('newRoomID', roomID);

		var playerCount = getPlayersFromRoom(roomID).length; //Gets the length of the array which equals the player count
		updatePlayerCount(roomID, playerCount); 
	});

	socket.on('joinRoom', function(roomID){
		//If the player already is in a room
		if(PLAYER_DATA[socket.id].room !== null){
			var errorMessage = "You're already in a room!";
			socket.emit('alert', errorMessage);
			return true;
		}

		//If the room exists
		if(ROOM_LIST[roomID] != null){

			//If there already are 8 players in the room
			if(getPlayersFromRoom(roomID).length >= 8){
				var errorMessage = "This room's full!";
				socket.emit('alert', errorMessage);
				return true;
			}else if(ROOM_LIST[roomID].state !== "Waiting"){
				var errorMessage = "This room's already playing!";
				socket.emit('alert', errorMessage);
				return true;
			}

			ROOM_LIST[roomID].players.push(socket.id); //Adds the player to the players array inside of the room object inside of the ROOM_LIST
			PLAYER_DATA[socket.id].room = roomID; //Changes the room in PLAYER_DATA to the room id
			
			socket.emit('newRoomID', roomID);

			var playerCount = getPlayersFromRoom(roomID).length; //Gets the length of the array which equals the player count
			updatePlayerCount(roomID, playerCount); 
		}else{
			var errorMessage = "Room does not exist!";
			socket.emit('alert', errorMessage)
		}
	});

	socket.on('leaveRoom', function(){
		if(PLAYER_DATA[socket.id].room !== null){
			leaveRoom(socket);
		}else{
			var errorMessage = "You aren't in any room!";
			socket.emit('alert', errorMessage);
		}
	});

	socket.on('startGame', function(){
		var roomID = PLAYER_DATA[socket.id].room;
		if(socket.id === ROOM_LIST[roomID].host){ //If the player is indeed the host (they didn't do some client side tinkering)
			ROOM_LIST[roomID].level = 1;
			levelTransition(roomID, 1);
			setTimeout(startGame, 3000, roomID); //(functionName, delay in ms, arguments for function)
		}else{
			var errorMessage = "You aren't the host!";
			socket.emit('alert', errorMessage);
		}
	});

	socket.on('toggleSwitchPress', function(elementID){
		var array = getBoardData(socket); //Get all the elements from the room the players in
		var roomID = PLAYER_DATA[socket.id].room;

		array.forEach(function(i){	//Cycle through them (i is the element object)
			if(i.id == elementID){ //If the given elementID matches with the id of that object
				i.state = !i.state; //Change the state
				var taskCompleted = checkTask(roomID, i.id, i.state);	//Check if a task is completed by doing this, if yes, it returns the index of that task
				if(taskCompleted !== false){
					ROOM_LIST[roomID].totalCompleted += 1;
					ROOM_LIST[roomID].masterHealth += 10;

					var task = ROOM_LIST[roomID].tasks[taskCompleted];
					var targetSocket = SOCKET_LIST[task.owner];
					ROOM_LIST[roomID].tasks.splice(taskCompleted, 1);
					var newTask = createTask(targetSocket, roomID);
					ROOM_LIST[roomID].tasks.push(newTask);
					targetSocket.emit('newTask', newTask);
				}else{
					ROOM_LIST[roomID].totalFailed += 1;
					ROOM_LIST[roomID].masterHealth -= 10;
				}
			}
		});
	});

	socket.on('sliderChange', function(data){
		var array = getBoardData(socket); //Get all the elements from the room the player's in
		var roomID = PLAYER_DATA[socket.id].room;
		array.forEach(function(i){
			if(i.id == data.id){
				i.state = data.value;	//Set the state equal to the new value
				var taskCompleted = checkTask(roomID, i.id, i.state); //see toggleswitchpress
				if(taskCompleted !== false){;
					ROOM_LIST[roomID].totalCompleted += 1;
					ROOM_LIST[roomID].masterHealth += 10;

					var task = ROOM_LIST[roomID].tasks[taskCompleted];	//Get the socket of the tasks owner
					var targetSocket = SOCKET_LIST[task.owner];

					ROOM_LIST[roomID].tasks.splice(taskCompleted, 1);
					var newTask = createTask(targetSocket, roomID);
					ROOM_LIST[roomID].tasks.push(newTask);
					targetSocket.emit('newTask', newTask);
				}else{
					ROOM_LIST[roomID].totalFailed += 1;
					ROOM_LIST[roomID].masterHealth -= 10;
				}
			}
		});
	});

	socket.on('buttonPress', function(elementID){
		var array = getBoardData(socket);
		var roomID = PLAYER_DATA[socket.id].room;

		array.forEach(function(i){
			if(i.id == elementID){
				i.state = 1;
				var taskCompleted = checkTask(roomID, i.id, i.state);
				if(taskCompleted !== false){
					ROOM_LIST[roomID].totalCompleted += 1;
					ROOM_LIST[roomID].masterHealth += 10;

					var task = ROOM_LIST[roomID].tasks[taskCompleted];
					var targetSocket = SOCKET_LIST[task.owner];

					ROOM_LIST[roomID].tasks.splice(taskCompleted, 1);
					var newTask = createTask(targetSocket, roomID);
					ROOM_LIST[roomID].tasks.push(newTask);
					targetSocket.emit('newTask', newTask);
				}else{
					ROOM_LIST[roomID].totalFailed += 1;
					ROOM_LIST[roomID].masterHealth -= 10;
				}
				i.state = 0;
			}
		});
	})

	socket.on('requestState', function(elementID){
		var array = getBoardData(socket); //Get all the elements from the room the players in
		array.forEach(function(i){	// i is the element object
			if(i.id == elementID){
				socket.emit('requestReply', i.state); //Send out the current state
			}
		});
	});

});

function createRoomId(socket){

	while(true){
		var rNumber = Math.floor(000000 + Math.random() * 999999); //Creates a random 6 digit number to be used as the room id
		if(ROOM_LIST[rNumber] == null){ //If a room with that id doesn't exist yet
			
			ROOM_LIST[rNumber] = { //Create a room and add the host to the players array
				host: socket.id,
				masterHealth: 50,
				players: [],
				state: "Waiting",
				level: null,
				boardData: [],
				tasks: [],
				totalCompleted: 0,
				totalFailed: 0
			}

			ROOM_LIST[rNumber].players.push(socket.id); //Adds the player to the player array

			console.log("New Room Created With ID: " + rNumber);  
			return rNumber;
		}
	}
}

function leaveRoom(socket){
	if(PLAYER_DATA[socket.id].room !== null){ //Checks if the player joined any room
		var roomID = PLAYER_DATA[socket.id].room; //Gets the room id
		ROOM_LIST[roomID].players.splice(socket.id, 1); //Remove  the player from the player array in the room object

		var playerCount = getPlayersFromRoom(roomID).length; //Gets the length of the array which equals the player count
		updatePlayerCount(roomID, playerCount); 

		PLAYER_DATA[socket.id].room = null; //Changes the room in the PLAYER_DATA to null
		if(ROOM_LIST[roomID].players.length === 0){ //If there aren't any players in the room
			delete ROOM_LIST[roomID];
		}
	}
}

function startGame(roomID){
	var array = getPlayersFromRoom(roomID);
	array.forEach(function(i){ //cycle through that array (i = the value, not the index)
		var socket = SOCKET_LIST[i]; //Get the sockets with those IDs
		socket.emit('startGame'); //Emit that the game started

		generateBoard(socket, roomID);
		var task = createTask(socket, roomID);
		socket.emit('newTask', task);
		ROOM_LIST[roomID].tasks.push(task); //Add the task to the list
	});
	setInterval(function(){
		if(ROOM_LIST[roomID] == null){ //If the room doesn't exist anymore
			clearInterval(this);
		}else{
			updateHealth(roomID, this); //pass this (loop) with it to clear it if level is over
			sendData(roomID);
		}
	}, 1000/25); //This is stupid...

	ROOM_LIST[roomID].state = "Playing";
}

function levelTransition(roomID, newLevel){
	var players = getPlayersFromRoom(roomID);
	players.forEach(function(i){
		var socket = SOCKET_LIST[i];
		socket.emit('newLevel', newLevel);
	});
}

function updatePlayerCount(roomID, newPlayerCount){
	var array = getPlayersFromRoom(roomID);
	array.forEach(function(i){
		var socket = SOCKET_LIST[i];
		socket.emit('newPlayerCount', newPlayerCount);
	})
}

function getPlayersFromRoom(roomID){
	return ROOM_LIST[roomID].players; 
	//The array that contains all the players in that room
}


function generateBoard(socket, roomID){

	var newBoard = [];

	for(var j=0;j<8;j++){	//Execute 9 times

		var name = generateName(roomID);

		var element = {
			id: name.id,
			displayName: name.displayName,
			owner: socket.id,
			type: null,
			options: null,
			state: 0
		};

		//Select type and option count
		var rNumber = Math.floor(Math.random() * 100) //Random number between 0 and 100
		if(rNumber <= 30){
			element.type = "slider";
			var optionCounts = [3, 4, 6];
			element.options = optionCounts[Math.floor(Math.random() * 3)]; //Random number between 0 and 2
		}else if(rNumber > 30 && rNumber <= 65){
			element.type = "button";
			element.options = 1;
		}else{
			element.type = "switch";
			element.options = 2;
		}

		ROOM_LIST[roomID].boardData.push(element); //Add the element to the elemnets array
		newBoard.push(element);

	}

	socket.emit('newBoard', newBoard); 

}

function generateName(roomID){
	var array = names.nl; //Get all the dutch names

	while(true){

		var rNumber = Math.floor(Math.random() * array.length); //Generate a random number 
		var id = array[rNumber].id;
		var displayName = array[rNumber].displayName;

		var isDuplicate = false;
		var boardData = ROOM_LIST[roomID].boardData;

		for(var k=0;k<boardData.length;k++){ //cycle through all the elements and break if one of the elements ids is the same as the one generated
			if(id === boardData[k].id){
				isDuplicate = true;
				break;
			}
		}

		if(!isDuplicate){ //If it isn't duplicate name, return
			var name = {
				id: id,
				displayName: displayName
			}
			return name;
		}

	}
}


function createTask(socket, roomID){
	var elements = getBoardData(socket); //All the elements from the room the player's in
	var rNumber = Math.floor(Math.random() * elements.length); //Random number
	var element = elements[rNumber]; //Random element

	var type = element.type;
	var displayName = (element.displayName).toLowerCase();
	var currentState = element.state;
	var options = element.options;
	var taskMSG;
	var requiredState;

	var task = {
		owner: socket.id,
		health: 100,
		taskMSG: null,
		elementID: element.id,
		requiredState: null
	}

	if(type === "button"){
		task.taskMSG = "Press " + displayName;
		task.requiredState = 1;
	}else if(type === "switch"){
		if(currentState == 0){
			task.taskMSG = "Switch on " + displayName;
			task.requiredState = 1;
		}else{
			task.taskMSG = "Switch off " + displayName;
			task.requiredState = 0;
		}
	}else if(type === "slider"){
		task.requiredState = generateRandomNumberWithException(options, currentState);
		task.taskMSG = "Set " + displayName + " to " + task.requiredState;
	}
	return task;
}

function taskFailed(roomID, tasks, task){
	for(var j=0;j<tasks.length;j++){
		if(task.owner === tasks[j].owner){
			ROOM_LIST[roomID].tasks.splice(j, 1); //Remove the task from the task list

			var socket = SOCKET_LIST[task.owner]; //Get the socket for that player
			var newTask = createTask(socket, roomID);	//Create a new task
			ROOM_LIST[roomID].tasks.push(newTask);
			socket.emit('newTask', newTask);

			ROOM_LIST[roomID].totalFailed += 1;
			ROOM_LIST[roomID].masterHealth -= 5;
		}
	}
}

function checkTask(roomID, elementID, currentState){
	var tasks = ROOM_LIST[roomID].tasks;
	for(var j=0;j<tasks.length;j++){
		var task = tasks[j];
		if(task.elementID === elementID && task.requiredState == currentState){ //If the task id and the required state match the task is completed
			return j; //Return the index of the task
		}
	};
	return false;
}

function getBoardData(socket){
	var room = PLAYER_DATA[socket.id].room;
	if(room != null){
		var boardData = ROOM_LIST[room].boardData;
		return boardData;
	}
}

function sendData(roomID){

	var array = getPlayersFromRoom(roomID);
	array.forEach(function(i){	//Cycle through all the players
		var socket = SOCKET_LIST[i];	//Get the socket
		var room = ROOM_LIST[roomID];
		var masterHealth = room.masterHealth;	//Get the master health from the room object

		var pack = {
			masterHealth: masterHealth,
			playerHealth: getPlayerHealth(i, roomID),
			totalCompleted: room.totalCompleted,
			totalFailed: room.totalFailed
		}

		socket.emit('newPlayerData', pack);	//Send out the new data to be displayed

	});
};

function updateHealth(roomID, gameLoop){

	var tasks = ROOM_LIST[roomID].tasks;
	tasks.forEach(function(i){	//Playerhealth
		if(i.health <= 0){
			taskFailed(roomID, tasks, i);
		}
		i.health = i.health - 0.5 * Math.sqrt(ROOM_LIST[roomID].level);
	});

	var masterHealth = ROOM_LIST[roomID].masterHealth;
	if(masterHealth >= 100){
		clearInterval(gameLoop);
		ROOM_LIST[roomID].masterHealth = 50;
		ROOM_LIST[roomID].level += 1;
		console.log(ROOM_LIST[roomID].level)
		resetBoards(roomID);
		var level = ROOM_LIST[roomID].level;
		levelTransition(roomID, level);
		setTimeout(startGame, 3000, roomID);
	}
}

function resetBoards(roomID){
	ROOM_LIST[roomID].boardData = [];
	ROOM_LIST[roomID].tasks = [];
}

function getPlayerHealth(socketID, roomID){
	var tasks = ROOM_LIST[roomID].tasks;//Get health from certain task
	for(var j=0;j<tasks.length;j++){
		if(SOCKET_LIST[socketID].id === tasks[j].owner){ //IF this socket is the same as the owner of the task
			return tasks[j].health;
		}
	}
}

function generateRandomNumberWithException(total, numToExclude){
	//This function is made with love and a horrible naming scheme
	var numbers = [];
	for(var i=0;i<total;i++){ //Generate a number with all the options
		numbers.push(i);
	}
	numbers.splice(numToExclude, 1); //Remove the number to exlude
	var rNumber = Math.floor(Math.random() * numbers.length);
	return numbers[rNumber];
}

function getTask(socket, roomID){
	var tasks = ROOM_LIST[roomID].tasks;
	for(var k=0;k<tasks.length;k++){
		if(socket.id == tasks[k].owner){
			return tasks[k];
		}
	}
}

/*process.on('uncaughtException', function(err, lineNumber){
	console.log("Caught exception: " + err);
	console.log("Line number: " + lineNumber);
});*/