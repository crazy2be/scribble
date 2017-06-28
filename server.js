var ws = require("nodejs-websocket")
var http = require('http')
var fs = require('fs')
var misc = require('./misc')

var app = http.createServer(handler)
var port = Number(process.env.PORT || 8000);
app.listen(port, function() {
  console.log("Ready at http://localhost:" + port + "/index.html");
});

function handler(req, res) {
    fs.readFile(__dirname + req['url'], function(err, data) {
        if (err) {
            res.writeHead(404);
            res.end("File not found!");
            return;
        }
        res.writeHead(200);
        res.end(data);
    });
}
 
Array.prototype.random = function () {
  return this[Math.floor((Math.random()*this.length))];
}

function throttle(fn, threshhold) {
  var last = 0;
  return function () {
    var now = Date.now();
    if (now < last + (threshhold || 500)) return;
    last = now;
    return fn.apply(null, arguments);
  };
}

function randomWord() {
    return "många";
    return 'apple'; // for testing
    // TODO: could be a larger word list. Other languages.
    return ["apple", "pepper", "chicken", "potato", "neuken", "keuken", "många"].random();
}

function fuzzyMatch(a, b) {
    return stripAccents(a) === stripAccents(b);
}

var stripAccents = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");

// For now, only one game. Easy to change.
var current_word = randomWord();
var current_hint = stripAccents(current_word).replace(/[a-zA-Z]/g, "_");
var next_player_id = 10;
var drawing_player_id = -1;
var host_player_id = -1;
var STATE_LOBBY = 'lobby', STATE_GAME = 'game';
var game_state = STATE_LOBBY;
var players = {};
// The server has to store a copy of the drawing
// in case someone joins part way through.
var drawing = [];

var coalesce = (() => {
    var prevID = 0;
    var numRecv = 0;
    var numSent = 0;
    var numBroad = 0;
    var different = (a, b) => a !== b && a !== -b && a !== 0 && b !== 0;
    return (id, msg) => {
        if ((numRecv + numSent + numBroad) > 0 && (msg[0] !== 'd' || different(id, prevID))) {
            if (numRecv > 0) console.log("Received", numRecv, "draw messages from", prevID)
            if (numSent > 0) console.log("Sent", numSent, "draw messages to player", prevID);
            if (numBroad > 0) console.log("Broadcast", numBroad, "draw messages to players", Object.keys(players));
            numRecv = numSent = numBroad = 0;
            return false;
        }
        if (msg[0] !== 'd') return false;
        if (id !== 0) prevID = Math.abs(id);
        if (id < 0) numRecv++;
        else if (id > 0) numSent++;
        else if (id === 0) numBroad++;
        return true;
    };
})();

var broadcast = (msg) => {
    if (!coalesce(0, msg)) console.log("Broadcasting", msg, "to players", Object.keys(players));
    for (var id in players) { players[id].conn.sendText(msg) }};

var send = (id, msg) => {
    if (!coalesce(id, msg)) console.log("Sending", msg, "to player", id);
    players[id].conn.sendText(msg);}

var next_id = (prev_id, state) => {
    var ids = Object.keys(players).map(s => parseInt(s));
    var fids = ids;
    if (state !== undefined) {
        fids = ids.filter(id => players[id].state === state);
    }
    if (ids.length === 0 || fids.length === 0) return -1;
    if (fids.length === 1) return fids[0];
    var id = prev_id;
    while (true) {
        id++;
        if (id > next_player_id) id = 0;
        if (fids.indexOf(id) >= 0) return id;
        if (id === prev_id) {
            console.log("WARNING, WE COULDNT FIND A NEXT ID (should never happen)");
            return prev_id;
        }
    }
}

var drawing_and_word_reset = () => {
    drawing = [];
    drawing_player_id = next_id(drawing_player_id, STATE_GAME);
    current_word = randomWord();
    current_hint = stripAccents(current_word).replace(/[a-zA-Z]/g, "_");
};

var tell_clients_about_new_drawing = () => {
    send(drawing_player_id, 'wdraw,' + current_word);
    for (var id in players) {
        if (id == drawing_player_id) continue;
        send(id, 'wguess,' + current_hint);
    }
    broadcast('gdrawer,' + drawing_player_id);
};

var server = ws.createServer(function (conn) {
    // Flow:
    //  Load page -> lobby. Join with default name, assigned ID.
    //  While in lobby, can change name and face.
    //  Game starts, lobby hidden, replaced with draw surface.
    // Protocol: First letter denotes type of message
    //  l
    // Joins lobby
    //  l543
    // Responds with your ID
    //  ghost,543
    // The game host is player id 543
    //  s
    // Game is started / start game
    //  pname,Trump
    // Set your player properties, here name to trump. Only valid in lobby.
    //  p543,name,Trump
    // Signifies a player with id 543 has changed name to Trump. May be new
    // or existing player.
    //  q543
    // Player id 543 has quit
    //  c543,A message
    // Is a chat message / guess
    //  wdraw,chicken
    // Is a word for the drawer to draw
    //  d257,356
    // Is a mouse move / draw command
    //  tbrush
    // Changes the tool that is used in draw commands.
    //  e
    // Empties the canvas, clears all draw queues. Used when switching drawers.
    console.log("New connection")
    var my_id = -1;
    var print_not_your_turn = throttle(() => send(my_id, "c0,Not your turn to draw, or game not started!"));
    conn.on("text", function (str) {
        if (!coalesce(-my_id, str)) console.log("Received "+str)
        switch (str[0]) {
        case 'l':
            if (my_id >= 0) {
                send(my_id, 'c0,Invalid state, already joined.');
                conn.close();
                return;
            }
            my_id = next_player_id++;
            players[my_id] = {
                conn: conn,
                name: "Anon " + ~~(Math.random()*1000),
                state: STATE_LOBBY,
                score: 0,
            };
            send(my_id, 'l' + my_id);
            for (var id in players) {
                if (parseInt(id) === my_id) continue;
                send(my_id, 'p' + id + ',name,' + players[id].name);
                send(my_id, 'p' + id + ',state,' + players[id].state);
            }
            broadcast('p' + my_id + ',name,' + players[my_id].name);
            broadcast('p' + my_id + ',state,' + players[my_id].state);
            if (host_player_id < 0) host_player_id = my_id;
            send(my_id, 'ghost,' + host_player_id);
            if (game_state == STATE_GAME) {
                send(my_id, 's');
                drawing.forEach(msg => send(my_id, msg));
            }
            break;
        case 'p':
            if (players[my_id].state != STATE_LOBBY) {
                send(my_id, 'c0,Cannot change player properties in game.');
                return;
            }
            var tmp = misc.split(str.slice(1), ',', 2), prop = tmp[0], val = tmp[1];
            if (prop === 'name') players[my_id].name = val;
            else console.log(">>>ERR UNKNOWN PROP", my_id, prop, val);
            broadcast('p' + my_id + ',' + prop + ',' + val);
            break;
        case 's':
            if (players[my_id].state != STATE_LOBBY) {
                send(my_id, "c0,Cannot join if not in lobby.")
                return;
            }
            if ((game_state !== STATE_GAME) && (my_id !== host_player_id)) {
                send(my_id, "c0,You are not the host, cannot start game.");
                return;
            }
            if (my_id === host_player_id) {
                game_state = STATE_GAME;
                drawing_and_word_reset();
                broadcast('s');
            }
            if (drawing_player_id < 0) {
                drawing_player_id = my_id;
                send(my_id, 'wdraw,' + current_word);
            } else {
                send(my_id, 'whint,' + current_hint);
            }
            send(my_id, 'gdrawer,' + drawing_player_id);

            players[my_id].state = STATE_GAME;
            broadcast('p' + my_id + ',state,' + players[my_id].state);
            broadcast('c0,' + players[my_id].name + ' has joined!');
            break;
        case 'c':
            var guess = str.slice(1);
            if ((game_state !== STATE_GAME) || (my_id === drawing_player_id) ||
                    !fuzzyMatch(guess, current_word)) {
                broadcast('c' + my_id + ',' + guess);
                return;
            }
            broadcast("c0,Player " + my_id + " (name " + players[my_id].name + ") wins!");
            drawing_and_word_reset();
            broadcast("e");
            tell_clients_about_new_drawing();
            break;
        case 'd': case 't':
            if (my_id != drawing_player_id || game_state !== STATE_GAME) {
                print_not_your_turn();
                return;
            }
            drawing.push(str);
            broadcast(str);
            break;
        default: broadcast('c0,Unhandled message "' + str + '", ignoring.'); break;
        }
    })
    conn.on("close", function (code, reason) {
        console.log("Connection closed")
        var name = players[my_id].name;
        delete players[my_id];
        broadcast('q' + my_id);
        broadcast('c0,Player ' + name + ' with id ' + my_id + ' has quit!');
        if (my_id === host_player_id) {
            host_player_id = next_id(host_player_id);
            broadcast('ghost,' + host_player_id);
        }
        if (my_id === drawing_player_id) {
            broadcast('c0,The drawer left!');
            drawing_and_word_reset();
            broadcast("e");
            // If a tree falls in a forest... It throws an exception
            if (drawing_player_id >= 0) tell_clients_about_new_drawing();
        }
    })
    conn.on("error", function (err) {
        console.log("Error (probably doesn't matter):", err);
    });
}).listen(8001)