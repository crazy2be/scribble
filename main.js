"use strict"
var log = function(...msg) {
    var div = document.createElement('div');
    div.className = 'chat-message';
    div.innerText = msg.join(' ');
    var chatMessages = document.getElementById('chat-messages');
    chatMessages.appendChild(div);
    // TODO: Should only do this if they have not scrolled up
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
class Drawer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.lineCap = 'round';
    }
    bucketFill(bx, by, color) {
        var OTHER = 0, SELF = 1, VISITED = 2;
        var canvas = this.canvas, w = canvas.width, h = canvas.height;
        var raw = this.ctx.getImageData(0, 0, w, h);
        var ix = (x, y) => y*w + x;
        var px = (i) => {
            i = i*4;
            return [raw.data[i], raw.data[i+1], raw.data[i+2], raw.data[i+3]];
        };
        var [br, bg, bb, ba] = px(ix(bx, by));
        var stencil = new Uint8Array(w*h);
        for (var cy = 0; cy < h; cy++) {
            for (var cx = 0; cx < w; cx++) {
                var ci = ix(cx, cy);
                var [cr, cg, cb, ca] = px(ci);
                if (br == cr && bg == cg && bb == cb && ba == ca) {
                    stencil[ci] = SELF;
                }
            }
        }
        var dfs = (x, y) => {
            if (stencil[ix(x, y)] !== SELF) return;
            if (x < 0 || x > w || y < 0 || y > h) return;
            console.log("visiting", x, y, stencil[ix(x, y)]);
            stencil[ix(x, y)] = VISITED;
            var adj = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (var i = 0; i < adj.length; i++) {
                dfs(adj[i][0] + x, adj[i][1] + y);
            }
            console.log("done", x, y);
        };
        //dfs(bx, by);

        var bfs = (x, y) => {
            var Q = [[x, y]];
            while (Q.length) {
                var cur = Q.shift();
                var adj = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (var i = 0; i < adj.length; i++) {
                    var x = adj[i][0] + cur[0], y = adj[i][1] + cur[1];
                    if (stencil[ix(x, y)] !== SELF) continue;
                    stencil[ix(x, y)] = VISITED;
                    Q.push([x, y]);
                }
            }
        };
        bfs(bx, by);

        for (var i = 0; i < w*h; i++) {
            if (stencil[i] !== VISITED) continue;
            raw.data[i*4] = color.r;
            raw.data[i*4+1] = color.g;
            raw.data[i*4+2] = color.b;
            raw.data[i*4+3] = 255;
        }
        this.ctx.putImageData(raw, 0, 0);
    }
    parseColor(hex) {
        if (hex[0] === '#') hex = hex.slice(1);
        if (hex.length === 3) hex.split('').map(s => s + s).join('');
        var r = hex.slice(0, 2), g = hex.slice(2, 4), b = hex.slice(4, 6);
        return {r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16)};
    }
    run(command) {
        var ctx = this.ctx;
        var [d, typ, msg] = split(command, ',', 3);
        switch (typ) {
        case 'm':
            if (!['pen', 'eraser'].includes(this.tool))
                throw "Should not recieve mouse move update while using tool " + this.tool;
            var [x, y] = split(msg, ',', 2).map(s => parseInt(s));
            ctx.lineTo(x, y);
            ctx.stroke();
            break;
        case 't':
            var [tool, args] = split(msg, ',', 2);
            console.log("Switched to tool", tool);
            this.tool = tool;
            switch (tool) {
            case 'pen':
                ctx.lineWidth = 1;
                ctx.strokeStyle = args || "#000";
                break;
            case 'eraser':
                ctx.lineWidth = 20;
                ctx.strokeStyle = "#FFF";
                break;
            case 'bucket':
                this.bucketColor = this.parseColor(args);
                break;
            default:
                console.log("Unknown tool", tool);
                break;
            }
            break;
        case 'd':
            var [x, y] = split(msg, ',', 2).map(c => parseInt(c))
            if (this.tool == 'bucket') {
                this.bucketFill(x, y, this.bucketColor);
            } else {
                ctx.beginPath();
                ctx.moveTo(x, y);
            }
            break;
        case 'clear':
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            break;
        default:
            console.log("Unknown draw command", command);
            break;
        }
    }
    clear() {
        this.run('d,clear');
        this.run('d,t,pen');
    }
}
class DrawCommandQueue {
    constructor(drawer, sock) {
        this.drawer = drawer;
        this.sock = sock;
        this.clear();
    }
    add(command) {
        var t = +new Date();
        this.times.push(t);
        this.commands.push(command);
        this.drawer.run(command);
        this.sock.send(command);
    }
    accept(command) {
        var t = +new Date();
        this.acceptedCommands.push(command);
        if (this.commands.length === 0) {
            this.drawer.run(command);
            return;
        } else {
            if (command !== this.commands[0]) {
                log("Got out of order command!");
                log("Expected", this.commands[0], this.times[0]);
                log("Got", command, t);
                // We messed up somewhere, drop everything we were predicting
                // and just draw what has been confirmed.
                this.commands = [];
                this.times = [];
                this.drawer.clear();
                this.acceptedCommands.forEach(cmd => this.drawer.run(cmd));
                return;
            }
            this.commands.shift();
            this.times.shift();
        }
    }
    clear() {
        this.acceptedCommands = [];
        this.commands = [];
        this.times = [];
        this.drawer.clear();
    }
    tool() {
        return this.drawer.tool;
    }
};
window.addEventListener('load', function() {
    var sock = new WebSocket((() => {
        var url = new URL(document.location.href);
        url.protocol = 'ws:';
        url.pathname += 'socket/';
        return url.toString();
    })())
    var myID = -1;
    var hostID = -1;
    var drawerID = -1;
    var $ = (q) => document.querySelector(q);
    var getOrCreate = (id, creator) => {
        var el = document.getElementById(id);
        if (el) return el;
        else    return creator(id);
    };
    var h = (...args) => {
        var e;
        function item(arg) {
            if (typeof arg === 'string') {
                if      (arg[0] === '.') e.classList.add(arg.slice(1));
                else if (arg[0] === '#') e.id = arg.slice(1);
                else if (e)              e.appendChild(document.createTextNode(arg));
                else                     e = document.createElement(arg);
            } else if (arg instanceof Node) {
                e.appendChild(arg);
            } else if (typeof arg === 'object') {
                for (var k in arg) {
                    e[k] = arg[k];
                }
            }
        }
        while (args.length) item(args.shift());
        return e;
    }
    var drawCommandQueue = new DrawCommandQueue(new Drawer(canvas), sock);
    log('test');
    sock.onmessage = function (ev) {
        //console.log("Got msg", ev.data);
        var [typ, msg] = split(ev.data, ',', 2);
        switch (typ) {
        case 'l':
            myID = parseInt(msg);
            document.getElementById("my-id").innerText = myID;
            break;
        case 'g':
            var [prop, val] = split(msg, ',', 2);
            if (prop === 'host') {
                var prev = $('#player' + hostID);
                if (prev) prev.querySelector('.is-host-icon').style.visibility = 'none';
                hostID = parseInt(val);
                document.getElementById('host-id').innerText = hostID;
                $('#player' + hostID).querySelector('.is-host-icon').style.visibility = '';
                if (hostID === myID) start.style.display = '';
                break;
            } else if (prop === 'drawer') {
                var prev = $('#player' + drawerID);
                if (prev) prev.querySelector('.is-drawing-icon').style.visibility = 'none';
                drawerID = parseInt(val);
                document.getElementById('drawer-id').innerText = drawerID;
                $('#player' + drawerID).querySelector('.is-drawing-icon').style.visibility = '';
                drawing.style.cursor = drawerID === myID ? 'crosshair' : 'not-allowed';
                $('#canvas-overlay').style.visibility = 'hidden';
                break;
            }
            log("Unknown game property", prop, val);
            break;
        case 's':
            start.innerText = 'Join';
            start.style.display = '';
            break;
        case 'c':
            var [id, msg] = split(msg, ',', 2);
            log(id, msg);
            break;
        case 'p':
            var [id, prop, val] = split(msg, ',', 3);
            var div = getOrCreate("player" + id, (elementID) => {
                var el =
                    h('div', '.player', `#${elementID}`,
                        {style: 'color: #999999'},
                        h('div', '.is-drawing-icon', {style: 'visibility: hidden'}, '🖍️'),
                        h('div', '.is-host-icon', {style: 'visibility: hidden'}, '🎙'),
                        h('div', '.name'),
                        h('div', {style: 'clear: both'}));
                players.appendChild(el);
                return el;
            });
            if (prop === 'name') {
                div.querySelector('.name').innerText = id + ' ' + val;
            } else if (prop === 'state') {
                if (val === 'lobby') div.style.color = '#999999';
                else if (val === 'game') div.style.color = '#000000';
                else log("Unknown player state", id, val);
            } else {
                log("Unknown player property", id, prop, val);
            }
            break;
        case 'q':
            var id = msg;
            var div = document.getElementById("player" + id);
            div.parentNode.removeChild(div);
            break;
        case 'd':
            drawCommandQueue.accept(ev.data);
            break;
        case 'e':
            drawCommandQueue.clear();
            break;
        case 'w':
            var [role, word] = split(msg, ',', 2);
            var txt = "???";
            switch (role) {
                case 'draw': txt ="Draw " + word + "!"; break;
                case 'guess': case 'hint':
                    // \u00a0 is a non-breaking space, so that we get larger spaces between words than
                    // between letters.
                    txt = "Guess " + word.split('').map(c => c == ' ' ? '\u00a0' : c).join(' ') + "!"; break;
                default: txt = "WARNING, UNKNOWN ROLE '" + role + "'"; break;
            }
            $('#word').setAttribute('data-visible', true);
            log(txt); $('#word').innerText = txt;
            break;
        default:
            log("Unhandled message '" + ev.data + "'.");
            break;
        }
    }
    sock.onopen = function () {
        sock.send('p,name,' + nameValue.value);
    };
    sock.onclose = function () {
        log("Disconnected.");
        document.body.style.background = 'red';
    };

    var nameValue = document.getElementById('name-value');
    start.onclick = () => {
        log("clicked");
        sock.send('s');
        start.disabled = true;
        start.onclick = null;
        document.getElementById("change-name").setAttribute("data-visible", "false");
        document.getElementById("join").setAttribute("data-visible", "false");
    };
    nameValue.oninput = () => {
        sock.send('p,name,' + nameValue.value);
    };

    var guess = document.querySelector('#chat-input textarea');
    guess.onkeypress = function(ev) {
        if (ev.keyCode == 13) {
            if (guess.value.trim().length > 0) {
                sock.send('c,' + guess.value);
                guess.value = '';
            }
            return false;
        }
    };

    setupDrawTools(drawCommandQueue, () => myID === drawerID);
});

function setupDrawTools(drawCommandQueue, isDrawTurn) {
    var clientToCanvas = (mx, my) => {
        var rect = canvas.getBoundingClientRect();
        var x = ~~((mx - rect.left) / (rect.width / canvas.width));
        var y = ~~((my - rect.top) / (rect.height / canvas.height));
        return [x, y];
    };
    canvas.ontouchstart = (ev) => {
        if (ev.touches.length === 1) {
            penDown(...clientToCanvas(ev.touches[0].clientX, ev.touches[0].clientY));
        } else if (ev.touches.length === 2) {
            var x = (ev.touches[0].pageX + ev.touches[1].pageX) / 2;
            var y = (ev.touches[0].pageY + ev.touches[1].pageY) / 2;
            openToolMenuOnscreen(x, y);
        }
        ev.preventDefault();
    };
    canvas.onmousedown = (ev) => {
        if (ev.button !== 0) return;
        penDown(...clientToCanvas(ev.clientX, ev.clientY));
        ev.preventDefault();
    };
    function penDown(x, y) {
        if (!isDrawTurn()) return;
        drawCommandQueue.add('d,d,' + x + ',' + y);
        if (['pen', 'eraser'].includes(drawCommandQueue.tool())) {
            canvas.onmousemove = penMove;
            canvas.ontouchmove = (ev) => penMove(ev.changedTouches[0]);
            function penMove(ev) {
                if (!isDrawTurn()) return;
                var [x, y] = clientToCanvas(ev.clientX, ev.clientY);
                drawCommandQueue.add('d,m,' + x + ',' + y);
            }
        }
    };
    // Window, as opposed to canvas, in order to prevent the mouse from getting
    // "stuck" down when released outside the canvas, or even outside the window.
    window.onmouseup = function () {
        canvas.onmousemove = null;
        canvas.ontouchmove = null;
    };

    var menu = new radialMenu({spacing: 0, "deg-start": 45});
    document.onclick = () => { menu.close(); };
    menu.add("🗑", {"onclick": () => {
        drawCommandQueue.add('d,clear');
        drawCommandQueue.add('d,t,pen,#OOOOOO');
        colorItems[0].open();
    }}); // Trash can => delete
    menu.add("⏥", {"text-style": "fill: pink", "onclick": () => {
        drawCommandQueue.add('d,t,eraser');
    }});
    var bucket = menu.add('b', {onclick: (ev) => {bucket.open(); ev.stopPropagation()}});
    var colors = [
        "#000000", "#4C4C4C", "#C1C1C1", "#FFFFFF", "#EF130B", "#740B07",
        "#FF7100", "#C23800", "#FFE400", "#E8A200", "#00CC00",
        "#005510", "#00B2FF", "#00569E", "#231FD3", "#0E0865", "#A300BA",
        "#550069", "#D37CAA", "#A75574", "#A0522D", "#63300D",
    ]
    var colorItems = [];
    for (let i = 0; i < colors.length; i++) {
        colorItems.push(menu.add("", {
            "size": 0.4,
            "background-style": "fill: " + colors[i],
            "onclick": () => {
                drawCommandQueue.add('d,t,pen,' + colors[i]);
            }}));
        bucket.add("", {
            "background-style": "fill: " + colors[i],
            "onclick": () => {
                drawCommandQueue.add('d,t,bucket,' + colors[i]);}});
    }
    function openToolMenuOnscreen(pageX, pageY) {
        if (!isDrawTurn()) return;
        // Prevent us from opening off the edge of the screen.
        menu.open();
        var box = menu.svg.getBBox();
        var xs = box.width / 2, ys = box.height / 2;
        var clamp = (n, a, b) => n < a ? a : n > b ? b : n;
        var mainContainer = document.getElementById('main-container');
        menu.openAt(
            clamp(pageX, xs, mainContainer.offsetWidth - xs),
            clamp(pageY, ys, mainContainer.offsetHeight - ys));
    }
    canvas.oncontextmenu = function(ev) {
        openToolMenuOnscreen(ev.pageX, ev.pageY);
        ev.preventDefault();
    };
}
