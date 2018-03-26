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

let preferences = {};

module.exports = function(io) {
	function updateCurrent() {
		let now = Date.now()
		let delta = (now - lastUpdate) / 1000;
		lastUpdate = now;
		if (!current || current.paused) return;
		current.currentTime += delta;
		if (current.currentTime >= current.duration + 2) {
			console.log(ts(), 'Stopping', current.id, 'because it ended');
			current = undefined;
			io.emit('play', undefined);
		}
	}
	setInterval(updateCurrent, 100);

	function setCurrent(id, user) {
		if (!id) {
			if (current === undefined) return Promise.resolve(false);
			console.log(ts(), 'Stopping from', user && user.username);
			current = undefined;
			io.emit('play', undefined);
			return Promise.resolve(true);
		}
		return getVideoInfo(id).catch(e => {
			console.log('Error getting video info for', id, e && e.error && e.error.error && e.error.error.message || e);
		}).then(info => {
			if (!info) return false;
			console.log(ts(), 'Playing', info.id, 'from', user && user.username);
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

	function pause(user) {
		updateCurrent();
		if (!current || current.paused) return;
		console.log(ts(), 'Pausing from', user && user.username);
		current.paused = true;
		io.emit('pause');
	}
	function resume(user) {
		updateCurrent();
		if (!current || !current.paused) return;
		console.log(ts(), 'Resuming from', user && user.username);
		current.paused = false;
		io.emit('resume');
	}
	function seek(time, user) {
		updateCurrent();
		if (!current) return;
		console.log(ts(), 'Seeking to', time, 'from', user && user.username);
		// current.paused = false;
		current.currentTime = time;
		io.emit('seek', time);
	}

	function handleUser(socket) {
		let ip = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;

		// console.log(ts(), 'User ' + ip + ' connected');
		let user = {
			id: socket.id,
			ip: ip,
			username: ip
		};
		users[socket.id] = user;
		socket.on('me', data => {
			data = data || {};
			let username = data.username;
			if (!username) return;
			user.username = username;
			if (!preferences[username]) {
				preferences[username] = {};
			}
			let pref = preferences[username];

			socket.on('play', id => setCurrent(id, user));
			socket.on('stop', () => setCurrent(undefined, user));
			socket.on('pause', () => pause(user));
			socket.on('resume', () => resume(user));
			socket.on('seek', time => seek(time, user));
			socket.on('preference', (key, value) => {
				pref[key] = value;
			});

			socket.emit('preferences', pref);
			if (current) {
				socket.emit('play', current);
			}
		});
		socket.on('disconnect', () => {
			// console.log(ts(), 'User ' + ip + ' disconnected');
			delete users[socket.id];
		});
	}

	io.on('connect', handleUser);
};
