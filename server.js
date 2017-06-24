var ws = require("nodejs-websocket")
var http = require('http')
var fs = require('fs')

var app = http.createServer(handler)
var port = Number(process.env.PORT || 8000);
app.listen(port, function() {
  console.log("Listening on " + port);
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

function randomWord() {
    return 'apple'; // for testing
    // TODO: could be a larger word list. Other languages.
    return ["apple", "pepper", "chicken", "potato", "neuken", "keuken"].random();
}

// For now, only one game. Easy to change.
var current_word = randomWord();
var current_hint = 'NO'; // TODO
console.log("Testing", current_word);
var player_id = 10;
var drawing_player_id = -1;
var players = {};
// The server has to store a copy of the drawing
// in case someone joins part way through.
var drawing = [];
var broadcast = (msg) => {
    console.log("Broadcasting ", msg,
        Object.keys(players).reduce(
            (newObj, id) => {
                newObj[id] = {
                    name: players[id].name,
                    score: players[id].score};
                return newObj}, {}));
    for (var id in players) { players[id].conn.sendText(msg) }};
var server = ws.createServer(function (conn) {
    // Protocol: First letter denotes type of message
    //  nTrump
    // Sets your name and joins the game.
    //  p543,Trump
    // Signifies a new player has joined, with id 543 and name Trump
    //  q543
    // Player id 543 has quit
    //  cA message
    // Is a chat message / guess
    //  wdraw,chicken
    // Is a word for the drawer to draw
    //  d257,543
    // Is a mouse move / draw command
    //  tbrush
    // Changes the tool that is used in draw commands.
    console.log("New connection")
    var my_id = player_id++;
    players[my_id] = {
        conn: conn,
        name: "Anon",
        score: 0,
    };
    conn.on("text", function (str) {
        console.log("Received "+str)
        switch (str[0]) {
        case 'n':
            // Just a precaution against , injection attacks. The messages are
            // designed such that this shouldn't be possible regardless, but
            // you can't be too careful...
            var name = str.slice(1).replace(/,/g, '');
            for (var id in players) {
                conn.sendText('p' + id + ',' + players[id].name);
            }
            drawing.forEach((msg) => conn.sendText(msg));
            players[my_id].name = name;
            if (drawing_player_id < 0) {
                drawing_player_id = my_id;
                conn.sendText('wdraw,' + current_word);
            } else {
                conn.sendText('whint,' + current_hint);
            }
            broadcast('p' + my_id + ',' + name);
            broadcast('c' + name + ' has joined!');
        case 'c':
            var guess = str.slice(1);
            if ((guess.toLowerCase() == current_word.toLowerCase()) && (my_id != drawing_player_id)) {
                broadcast("c0,Player " + my_id + " (name " + players[my_id].name + ") wins!");
                drawing = [];
                drawing_player_id = Object.keys(players).random();
                current_word = randomWord();
                current_hint = current_word.replace(/[a-zA-Z]/g, "_");
                players[drawing_player_id].conn.sendText('wdraw,' + current_word);
                for (var id in players) {
                    if (id == drawing_player_id) continue;
                    players[id].conn.sendText('wguess,' + current_hint);
                }
            } else {
                broadcast('c' + my_id + ',' + guess);
            }
            break;
        case 'd': case 't': drawing.push(str); broadcast(str); break;
        default: broadcast('cUnhandled message "' + str + '", ignoring.'); break;
        }
    })
    conn.on("close", function (code, reason) {
        console.log("Connection closed")
        delete players[my_id];
        broadcast('q' + my_id);
    })
    conn.on("error", function (err) {
        console.log("Error (probably doesn't matter):", err);
    });
}).listen(8001)