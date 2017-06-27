window.addEventListener('load', function() {
    var sock = new WebSocket('ws://' + location.hostname + ':8001')
    var ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    var lastPoint = null;
    var curTool = 'pen';
    var myID = -1;
    var hostID = -1;
    var drawerID = -1;
    var log = function(...msg) {
        var div = document.createElement('div');
        div.className = 'chat-message';
        div.innerText = msg.join(' ');
        document.getElementById('chat-messages').appendChild(div);
    }
    var getOrCreate = (id, ctor) => {
        var el = document.getElementById(id);
        if (el) return el;
        el = ctor();
        el.id = id;
        return el;
    };

    log('test');
    sock.onmessage = function (ev) {
        //console.log("Got msg", ev.data);
        switch (ev.data[0]) {
        case 'l':
            myID = parseInt(ev.data.slice(1));
            document.getElementById("my-id").innerText = myID;
            break;
        case 'g':
            var [prop, val] = split(ev.data.slice(1), ',', 2);
            if (prop === 'host') {
                hostID = parseInt(val);
                if (hostID === myID) start.style.display = '';
                document.getElementById('host-id').innerText = hostID;
                break;
            } else if (prop === 'drawer') {
                drawerID = parseInt(val);
                break;
            }
            log("Unknown game property", prop, val);
            break;
        case 's':
            start.innerText = 'Join';
            start.style.display = '';
            break;
        case 'c':
            var [id, msg] = split(ev.data.slice(1), ',', 2);
            log(id, msg);
            break;
        case 'p':
            var [id, prop, val] = split(ev.data.slice(1), ',', 3);
            var div = getOrCreate("player" + id, () => {
                var div = document.createElement("div");
                div.className = "player";
                div.style.color = '#999999';
                players.appendChild(div);
                return div;
            });
            if (prop === 'name') {
                div.innerText = id + ' ' + val;
            } else if (prop === 'state') {
                if (val === 'lobby') div.style.color = '#999999';
                else if (val === 'game') div.style.color = '#000000';
                else log("Unknown player state", id, val);
            } else {
                log("Unknown player property", id, prop, val);
            }
            break;
        case 'q':
            var id = ev.data.slice(1);
            var div = document.getElementById("player" + id);
            div.parentNode.removeChild(div);
            break;
        case 'd':
            var [x, y] = split(ev.data.slice(1), ',', 2).map(s => parseInt(s));
            if (lastPoint) {
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
            lastPoint = {x: x, y: y};
            break;
        case 't':
            var [tool, args] = split(ev.data.slice(1), ',', 2);
            if (tool == 'pen') {
                console.log("pen");
                lastPoint = null;
                ctx.lineWidth = 1;
                ctx.strokeStyle = args || "#000";
                ctx.beginPath();
            } else if (tool == 'eraser') {
                console.log("eraser");
                lastPoint = null;
                ctx.lineWidth = 20;
                ctx.strokeStyle = "#FFF";
                ctx.beginPath();
            } else if (tool == 'clear') {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            } else {
                log("Unknown tool '" + tool + "'.");
                break;
            }
            curTool = ev.data.slice(1);
            break;
        case 'w':
            var [role, word] = split(ev.data.slice(1), ',', 2);
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
    sock.onopen = function () { sock.send('l'); };
    sock.onclose = function () {
        log("Disconnected.");
        document.body.style.backgroundColor = 'red';
    };
    canvas.onmousedown = function (ev) {
        if (ev.button !== 0) return;
        if (curTool == 'clear') return;
        canvas.onmousemove = function (ev) {
            var x = ~~((ev.clientX - canvas.offsetLeft) / (canvas.offsetWidth / canvas.width));
            var y = ~~((ev.clientY - canvas.offsetTop) / (canvas.offsetHeight / canvas.height));
            sock.send('d' + x + ',' + y);
        }
        sock.send('t' + curTool);
        ev.preventDefault();
        return false;
    };
    canvas.onmouseup = function () {
        canvas.onmousemove = null;
    };
    start.onclick = () => {
        log("clicked");
        sock.send('s');
        start.disabled = true;
        start.onclick = null;
    };
    var menu = new radialMenu({spacing: 0, "deg-start": 57});
    document.onclick = () => { menu.close(); };
    menu.add("🗑", {"onclick": () => {
        sock.send('tclear');
    }}); // Trash can => delete
    menu.add("⏥", {"text-style": "fill: pink", "onclick": () => {
        sock.send('teraser');
    }});
    colors = [
        "#000000", "#4C4C4C", "#C1C1C1", "#FFFFFF", "#EF130B", "#740B07",
        "#FF7100", "#C23800", "#FFE400", "#E8A200", "#00CC00",
        "#005510", "#00B2FF", "#00569E", "#231FD3", "#0E0865", "#A300BA",
        "#550069", "#D37CAA", "#A75574", "#A0522D", "#63300D",
    ]
    for (let i = 0; i < colors.length; i++) {
        menu.add("", {"size": 0.4, "background-style": "fill: " + colors[i],
            "onclick": () => {sock.send('tpen,' + colors[i]);}});
    }
    canvas.oncontextmenu = function(ev) {
        menu.openAt(ev.pageX, ev.pageY);
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
