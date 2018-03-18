function setStyle(elem, style) {
	if (!elem || !elem.style) return;
	Object.keys(style).forEach(key => {
		elem.style[key] = style[key];
	});
}

let socket;

function ready() {
	if (!socket) return;
	socket.on('play', video => {
		console.log('playing', video);
	});
}

let base = 'http://discordtv.balibalo.xyz/';
let ioScript = document.createElement('script');
ioScript.onload = function() {
	socket = io(base);
	ready();
};
ioScript.src = base + 'socket.io/socket.io.js';
document.body.appendChild(ioScript);
