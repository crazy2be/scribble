window.addEventListener('load', function() {
    var sock = new WebSocket('ws://' + location.hostname + ':8001')
    var ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    var curTool = 'pen';
    var myID = -1;
    var hostID = -1;
    var drawerID = -1;
    var log = function(...msg) {
        var div = document.createElement('div');
        div.className = 'chat-message';
        div.innerText = msg.join(' ');
        var chatMessages = document.getElementById('chat-messages');
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    var getOrCreate = (id, ctor) => {
        var el = document.getElementById(id);
        if (el) return el;
        el = ctor();
        el.id = id;
        return el;
    };
    class Drawer {
        constructor(ctx) {
            this.ctx = ctx;
            this.lastPoint = null;
        }
        run(command) {
            var ctx = this.ctx;
            if (command[0] === 'd') {
                var [x, y] = split(command.slice(1), ',', 2).map(s => parseInt(s));
                if (this.lastPoint) {
                    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
                this.lastPoint = {x: x, y: y};
            } else if (command[0] === 't') {
                var [tool, args] = split(command.slice(1), ',', 2);
                if (tool == 'pen') {
                    console.log("pen");
                    this.lastPoint = null;
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = args || "#000";
                    ctx.beginPath();
                } else if (tool == 'eraser') {
                    console.log("eraser");
                    this.lastPoint = null;
                    ctx.lineWidth = 20;
                    ctx.strokeStyle = "#FFF";
                    ctx.beginPath();
                } else if (tool == 'clear') {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                } else {
                    log("Unknown tool '" + tool + "'.");
                    return;
                }
            }
        }
        clear() {
            this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    class DrawCommandQueue {
        constructor(drawer) {
            this.acceptedCommands = [];
            this.commands = [];
            this.times = [];
            this.drawer = drawer;
        }
        add(command) {
            if (drawerID !== myID) {
                // TODO: Log something?
                return;
            }
            var t = +new Date();
            this.times.push(t);
            this.commands.push(command);
            this.drawer.run(command);
            sock.send(command);
        }
        accept(command) {
            var t = +new Date();
            this.acceptedCommands.push(command);
            if (drawerID !== myID) {
                this.drawer.run(command);
                return;
            }
            if (command !== this.commands[0]) {
                log("Got out of order command!");
                log("Expected", this.commands[0], this.times[0]);
                log("Got", command, t);
                // We messed up somewhere, drop everything we were predicting
                // and just draw what has been confirmed.
                this.commands = [];
                this.times = [];
                this.drawer.clear();
                this.acceptedCommands.forEach(cmd => drawer.run(cmd));
                return;
            }
            this.commands.shift();
            this.times.shift();
        }
        clear() {
            this.acceptedCommands = [];
            this.commands = [];
            this.times = [];
            this.drawer.clear();
        }
    };
    var drawCommandQueue = new DrawCommandQueue(new Drawer(ctx));
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
                document.getElementById('drawer-id').innerText = drawerID;
                drawing.style.cursor = drawerID === myID ? 'crosshair' : 'not-allowed';
                drawCommandQueue.clear();
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
                if (parseInt(id) === myID) {
                    log("Successfully set player name to " + val);
                    nameSubmit.disabled = false;
                }
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
            drawCommandQueue.accept(ev.data);
            break;
        case 't':
            drawCommandQueue.accept(ev.data);
            curTool = ev.data.slice(1);
            break;
        case 'w':
            var [role, word] = split(ev.data.slice(1), ',', 2);
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
            drawCommandQueue.add('d' + x + ',' + y);
        }
        drawCommandQueue.add('t' + curTool);
        ev.preventDefault();
        return false;
    };
    canvas.onmouseup = function () {
        canvas.onmousemove = null;
    };
    var nameValue = document.getElementById('name-value');
    var nameSubmit = document.getElementById('name-submit');
    start.onclick = () => {
        log("clicked");
        sock.send('s');
        start.disabled = true;
        start.onclick = null;
        document.getElementById("change-name").setAttribute("data-visible", "false");
        document.getElementById("join").setAttribute("data-visible", "false");
    };
    nameSubmit.onclick = () => {
        log("Setting name '" + nameValue.value + "'");
        nameSubmit.disabled = true;
        sock.send('pname,' + nameValue.value);
    };
    var menu = new radialMenu({spacing: 0, "deg-start": 57});
    document.onclick = () => { menu.close(); };
    menu.add("🗑", {"onclick": () => {
        drawCommandQueue.add('tclear');
    }}); // Trash can => delete
    menu.add("⏥", {"text-style": "fill: pink", "onclick": () => {
        drawCommandQueue.add('teraser');
    }});
    colors = [
        "#000000", "#4C4C4C", "#C1C1C1", "#FFFFFF", "#EF130B", "#740B07",
        "#FF7100", "#C23800", "#FFE400", "#E8A200", "#00CC00",
        "#005510", "#00B2FF", "#00569E", "#231FD3", "#0E0865", "#A300BA",
        "#550069", "#D37CAA", "#A75574", "#A0522D", "#63300D",
    ]
    for (let i = 0; i < colors.length; i++) {
        menu.add("", {"size": 0.4, "background-style": "fill: " + colors[i],
            "onclick": () => {drawCommandQueue.add('tpen,' + colors[i]);}});
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
