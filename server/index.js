const ts = require('../utils/timestamp');
const { getVideoInfo } = require('./youtube');

let lastUpdate = Date.now();
let current = undefined;
// {
// 	id: undefined,
// 	startAt: 0,
// 	startedBy: { name: '' },
// 	paused: true,
// 	currentTime: 0,
// 	duration: 0,
// 	title: '',
// 	channel: ''
// };

let users = {};

module.exports = function(io) {
	function updateCurrent() {
		let now = Date.now()
		let delta = (now - lastUpdate) / 1000;
		lastUpdate = now;
		if (!current || current.paused) return;
		current.currentTime += delta;
		if (current.currentTime >= current.duration + 2) {
			current = undefined;
			io.emit('play', undefined);
		}
	}
	setInterval(updateCurrent, 1000);

	function setCurrent(id, user) {
		if (!id) {
			if (current === undefined) return promise.resolve(false);
			current = undefined;
			io.emit('play', undefined);
			return Promise.resolve(true);
		}
		return getVideoInfo(id).catch(e => console.log('Error getting video info for', id, e)).then(info => {
			if (!info) return false;
			console.log(ts(), 'Playing', info.id);
			current = {
				id: info.id,
				startAt: Date.now(),
				startedBy: user,
				paused: false,
				currentTime: 0,
				duration: info.duration,
				title: info.title,
				channel: info.channel
			};
			io.emit('play', current);
			return true;
		});
	}

	function pause() {
		updateCurrent();
		if (!current || current.paused) return;
		current.paused = true;
		io.emit('pause');
	}
	function resume() {
		updateCurrent();
		if (!current || !current.paused) return;
		current.paused = false;
		io.emit('resume');
	}
	function seek(time) {
		updateCurrent();
		if (!current) return;
		current.paused = false;
		current.currentTime = time;
		io.emit('seek', time);
	}

	function handleUser(socket) {
		let ip = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;

		console.log(ts(), 'User ' + ip + ' connected');
		let user = {
			id: socket.id,
			discordId: undefined,
			ip: ip,
			name: ip
		};
		users[socket.id] = user;
		socket.on('me', data => {
			data = data || {};
			user.discordId = data.discordId || undefined;
			user.name = data.name || '';
		});
		socket.on('play', id => setCurrent(id, user));
		socket.on('stop', () => setCurrent(undefined, user));
		socket.on('pause', pause);
		socket.on('resume', resume);
		socket.on('disconnect', () => {
			console.log(ts(), 'User ' + ip + ' disconnected');
			delete users[socket.id];
		});
		if (current) {
			socket.emit('play', current);
		}
	}

	io.on('connect', handleUser);
};
