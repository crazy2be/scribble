window.addEventListener('load', function() {
    var sock = new WebSocket('ws://' + location.hostname + ':8001')
    sock.onmessage = function (ev) {
        console.log("Got msg", ev.data);
        switch (ev.data[0]) {
        case 'c':
            chat.innerText += ev.data.slice(1) + '\n';
            break;
        case 'p':
            var [id, name] = ev.data.slice(1).split(',', 2);
            var div = document.createElement("div");
            div.className = "player";
            div.id = "player" + id;
            div.innerText = name;
            players.appendChild(div);
            break;
        case 'q':
            var id = ev.data.slice(1);
            var div = document.getElementById("player" + id);
            div.parentNode.removeChild(div);
            break;
        case 'd':
            var [x, y] = ev.data.slice(1).split(',', 2).map(s => parseInt(s));
            var ctx = canvas.getContext('2d');
            ctx.fillRect(x, y, 1, 1);
            break;
        default:
            chat.innerText += "Unhandled message '" + ev.data + "'.";
            break;
        }
    }
    sock.onopen = function () {
        sock.send('test');
        sock.send('nTrump');
    };
    canvas.onmousedown = function () {
        canvas.onmousemove = function (ev) {
            var x = ~~((ev.clientX - canvas.offsetLeft) / (canvas.offsetWidth / canvas.width));
            var y = ~~((ev.clientY - canvas.offsetTop) / (canvas.offsetHeight / canvas.height));
            sock.send('d' + x + ',' + y);
        }
    };
    canvas.onmouseup = function () {
        canvas.onmousemove = null;
    }
});
