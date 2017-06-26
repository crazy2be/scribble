window.addEventListener('load', function() {
    var sock = new WebSocket('ws://' + location.hostname + ':8001')
    var ctx = canvas.getContext('2d');
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
                ctx.beginPath();
            } else {
                log("Unknown tool '" + tool + "'.");
                break;
            }
            curTool = tool;
            break;
        case 'w':
            var [role, word] = ev.data.slice(1).split(',', 2);
            if (role == 'draw' || role == 'guess') {
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
    var menu = new radialMenu({spacing: 0});
    menu.add("🗑"); // Trash can => delete
    menu.add("🖌"); // Paint brush
    menu.add("Fill");
    colors = [
        "#FFF","#C1C1C1","#EF130B","#FF7100","#FFE400","#00CC00",
        "#00B2FF","#231FD3","#A300BA","#D37CAA","#A0522D",
        "#000","#4C4C4C","#740B07","#C23800","#E8A200","#005510",
        "#00569E","#0E0865","#550069","#A75574","#63300D"]
    for (var i = 0; i < colors.length; i++) {
        menu.add("", {"size": 0.5, "background-style": "fill: " + colors[i]});
    }
    canvas.oncontextmenu = function(ev) {
        menu.open();
        ev.preventDefault();
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
