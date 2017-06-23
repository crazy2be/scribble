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
 
console.log("Testing");
// Scream server example: "hi" -> "HI!!!" 
var server = ws.createServer(function (conn) {
    console.log("New connection")
    conn.on("text", function (str) {
        console.log("Received "+str)
        conn.sendText(str.toUpperCase()+"!!!")
    })
    conn.on("close", function (code, reason) {
        console.log("Connection closed")
    })
}).listen(8001)