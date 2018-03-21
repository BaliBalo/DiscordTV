function loadScript(url, onload) {
	let script = document.createElement('script');
	script.onload = onload;
	script.src = url;
	document.body.appendChild(script);
}

function setStyle(elem, style) {
	if (!style || !elem || !elem.style) return;
	Object.keys(style).forEach(key => {
		elem.style[key] = style[key];
	});
}
function create(type, style) {
	if (typeof type !== 'string') {
		style = type;
		type = 'div';
	}
	let elem = document.createElement(type);
	setStyle(elem, style);
	return elem;
}

let socket;
let dom = {};
let position = [100, 30];
// let anchor = ['start', 'start'];
let ratio = 16 / 9;
let size = [360, 360 / ratio];

let grabbedAt = null;
function grab(e) {
	grabbedAt = [e.clientX - position[0], e.clientY - position[1]];
}
function move(e) {
	if (!grabbedAt) return;
	position[0] = e.clientX - grabbedAt[0];
	position[1] = e.clientY - grabbedAt[1];
	updatePosition();
}
function release() {
	grabbedAt = null;
}

function initiateRequest(e) {
	let input = create('input', {
		position: 'absolute',
		width: '0',
		height: '0',
		top: '-999px',
		left: '-999px',
		opacity: '0'
	});
	let msg = create({
		position: 'absolute',
		top: '15px',
		left: '0',
		background: '#336',
		color: '#fff',
		padding: '10px',
		borderRadius: '5px',
		fontFamily: 'sans-serif',
		fontSize: '20px',
		opacity: '0',
		transform: 'translate(-30px, -50%) scale(.7)',
		transition: 'opacity .5s, transform .5s',
	});
	msg.textContent = 'Ctrl + V';

	let closed = false;
	let close = () => {
		if (closed) return;
		closed = true;
		setStyle(msg, {
			opacity: '0',
			transform: 'translate(15px, -50%) scale(.7)',
		});
		setTimeout(() => dom.main.removeChild(msg), 600);
		document.body.removeChild(input);
	};
	input.addEventListener('blur', close);
	input.addEventListener('input', () => {
		parseRequest(input.value);
		close();
	});

	dom.main.appendChild(msg);
	document.body.appendChild(input);
	input.focus();
	msg.clientWidth;
	setStyle(msg, {
		opacity: '1',
		transform: 'translate(-5px, -50%) scale(1)',
	});
}
function parseRequest(val) {
	if (!val) return;
	// Just an id
	if (val.match(/^[a-z_-]{11}$/i)) return sendRequest(val);
	let match = val.match(/(?:[?&]v=|youtu.be\/)([a-z_-]+)/i);
	if (match) {
		sendRequest(match[1]);
	}
}
function sendRequest(id) {
	socket.emit('play', id);
}

function updatePosition() {
	setStyle(dom.main, {
		// left: position[0] + 'px',
		// top: position[1] + 'px',
		transform: 'translate(' + position[0] + 'px, ' + position[1] + 'px)'
	});
}

function createElements() {
	dom.main = create({
		position: 'absolute',
		left: '0',
		top: '0',
		width: '360px',
		fontFamily: 'sans-serif'
	});
	dom.topBar = create({
		display: 'flex',
		flexFlow: 'row nowrap',
		height: '30px',
		background: '#333',
		color: '#fff',
		cursor: 'move',
		'borderRadius': '6px 5px 0 0',
		// overflow: 'hidden'
	});
	dom.topBar.addEventListener('mousedown', grab);
	document.addEventListener('mousemove', move);
	document.addEventListener('mouseup', release);
	dom.requestButton = create('button', {
		flex: '0 0 auto',
		width: '30px',
		height: '30px',
		background: '#c62326 url(http://discordtv.balibalo.xyz/youtube.png) center / contain no-repeat',
		border: 'none',
		borderRadius: '5px 0 0 0',
		cursor: 'pointer',
		outline: 'none',
	});
	dom.requestButton.addEventListener('mousedown', e => e.stopPropagation());
	dom.requestButton.addEventListener('click', initiateRequest);
	dom.info = create({
		flex: '1 1 auto',
		overflow: 'hidden',
		display: 'flex',
		flexFlow: 'column nowrap',
		justifyContent: 'space-around',
		whiteSpace: 'nowrap',
		padding: '0 5px'
	});
	dom.title = create({
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		fontSize: '.8rem',
	});
	// dom.title.textContent = 'Title of the video here which can be quite long in some cases so be careful';
	dom.user = create({
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		fontSize: '.5rem',
		lineHeight: '.5rem',
		color: '#aaa'
	});
	// dom.user.textContent = 'Bali Balo';
	dom.link = create('a', {
		flex: '0 0 auto',
		width: '0',
		height: '30px',
		background: 'url(http://discordtv.balibalo.xyz/link.png) center / auto 75% no-repeat',
		transition: 'width .25s'
	});
	dom.link.addEventListener('mousedown', e => e.stopPropagation());
	dom.link.target = '_blank';
	// dom.link.href = 'https://www.youtube.com/watch?v=6Ppk-lfuNB8';

	dom.topBar.appendChild(dom.requestButton);
	dom.info.appendChild(dom.title);
	dom.info.appendChild(dom.user);
	dom.topBar.appendChild(dom.info);
	dom.topBar.appendChild(dom.link);
	dom.main.appendChild(dom.topBar);
	updatePosition();
	document.body.appendChild(dom.main);
}

function playVideo(data) {
	console.log('playing', data);
	if (!data || !data.id) {
		dom.title.textContent = '';
		dom.user.textContent = '';
		setStyle(dom.link, { width: '0' });
		return;
	}
	dom.title.textContent = data.title;
	let user = data.startedBy && data.startedBy.name || '';
	dom.user.textContent = user;
	dom.link.href = 'https://www.youtube.com/watch?v=' + data.id;
	setStyle(dom.link, { width: '30px' });
}

function ready() {
	if (!socket) return;
	socket.on('play', playVideo);
	// socket.emit('me', { name: 'Web user' });
}

let base = 'http://discordtv.balibalo.xyz/';

function onYouTubeIframeAPIReady() {
	loadScript(base + 'socket.io/socket.io.js', function() {
		createElements();
		socket = io(base);
		ready();
	});
}

loadScript('https://www.youtube.com/iframe_api');
