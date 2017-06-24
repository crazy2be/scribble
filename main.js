window.addEventListener('load', function() {
    var sock = new WebSocket('ws://' + location.hostname + ':8001')
    var lastPoint = null;
    var curTool = 'none';
    var log = function(...msg) {
        var div = document.createElement('div');
        div.className = 'chat-message';
        div.innerText = msg.join(' ');
        document.getElementById('chat-messages').appendChild(div);
    }
    log('test');
    sock.onmessage = function (ev) {
        console.log("Got msg", ev.data);
        switch (ev.data[0]) {
        case 'c':
            var [id, msg] = ev.data.slice(1).split(',', 2);
            log(id, msg);
            break;
        case 'p':
            var [id, name] = ev.data.slice(1).split(',', 2);
            var div = document.createElement("div");
            div.className = "player";
            div.id = "player" + id;
            div.innerText = id + ' ' + name;
            players.appendChild(div);
            break;
        case 'q':
            var id = ev.data.slice(1);
            var div = document.getElementById("player" + id);
            div.parentNode.removeChild(div);
            break;
        case 'd':
            var [x, y] = ev.data.slice(1).split(',', 2).map(s => parseInt(s));
            if (lastPoint) {
                var ctx = canvas.getContext('2d');
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
            lastPoint = {x: x, y: y};
            break;
        case 't':
            var tool = ev.data.slice(1);
            if (tool == 'none') {
                lastPoint = null;
            } else if (tool == 'pen') {
            } else {
                log("Unknown tool '" + tool + "'.");
                break;
            }
            curTool = tool;
            break;
        case 'w':
            var [role, word] = ev.data.slice(1).split(',', 2);
            // Hmm... Should I do this a better way. Probably.
            if (role == 'draw' || role == 'guess') {
                var ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            switch (role) {
                case 'draw': log("Draw " + word + "!"); break;
                case 'guess': log("Guess " + word.split('').join(' ') + "!"); break;
                case 'hint': log("Hint " + word.split('').join(' ') + '!'); break;
                default: log("WARNING, UNKNOWN ROLE '" + role + "'"); break;
            }
            break;
        default:
            log("Unhandled message '" + ev.data + "'.");
            break;
        }
    }
    sock.onopen = function () {
        sock.send('test');
        // Feature credit goes to mitboii for suggestion this mathematically
        // optimal name selection algorithm.
        sock.send('n' + ((Math.random() > 0.5) ? "boii" : "noboii"));
    };
    canvas.onmousedown = function (ev) {
        canvas.onmousemove = function (ev) {
            var x = ~~((ev.clientX - canvas.offsetLeft) / (canvas.offsetWidth / canvas.width));
            var y = ~~((ev.clientY - canvas.offsetTop) / (canvas.offsetHeight / canvas.height));
            sock.send('d' + x + ',' + y);
        }
        sock.send('tpen');
        ev.preventDefault();
        return false;
    };
    canvas.onmouseup = function () {
        canvas.onmousemove = null;
        sock.send('tnone');
    };
    var guess = document.querySelector('#chat-input textarea');
    guess.onkeypress = function(ev) {
        if (ev.keyCode == 13) {
            sock.send('c' + guess.value);
            guess.value = '';
            return false;
        }
    };
});
