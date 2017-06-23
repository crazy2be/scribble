window.addEventListener('load', function() {
    var sock = new WebSocket('ws://' + location.hostname + ':8001')
    sock.onmessage = function (ev) {
        console.log("Got msg", ev.data);
        switch (ev.data[0]) {
        case 'c':
            chat.innerText += ev.data.slice(1) + '\n';
            break;
        }
    }
    sock.onopen = function () {
        sock.send('test');
        sock.send('nTrump');
    };
});