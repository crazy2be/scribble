
// Like regular split, but splits beyond the n don't discard, but rather
// just stop splitting. Like you probably want.
function split(s, sep, n) {
    var res = [];
    for (var i = 0; (i < s.length) && (res.length + 1 < n); i++) {
        if (s[i] !== sep) continue;
        res.push(s.slice(0, i))
        s = s.slice(i + 1); // Skip the seperator
        i = 0;
    }
    res.push(s);
    return res;
}

if (typeof exports !== 'undefined') {
    exports.split = split;
}