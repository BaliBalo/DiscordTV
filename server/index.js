const ts = require('../utils/timestamp');
const { getVideoInfo } = require('./youtube');
const request = require('request-promise-native');

const preferences = global.preferences;
const history = global.history;

const ACTION_FORBIDDEN = 'ACTION_FORBIDDEN';

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

const users = global.ioUsers;

let serverUsers = {};
let serverUsersTimer;
function refreshServerUsers() {
	clearTimeout(serverUsersTimer);
	// Requesting data from bbbbot
	request({ url: 'http://127.0.0.1:3000/yt-users', json: true }).then(res => {
		serverUsers = res;
	}).catch(e => e).then(() => {
		serverUsersTimer = setTimeout(refreshServerUsers, 10000);
	});
}
refreshServerUsers();

function addToHistory(event, from, data) {
	history.insert({
		at: new Date(),
		event: event,
		user: from || null,
		data: data || null
	});
}

module.exports = function(io) {
	function updateCurrent() {
		let now = Date.now()
		let delta = (now - lastUpdate) / 1000;
		lastUpdate = now;
		if (!current || current.paused) return;
		current.currentTime += delta;
		if (current.currentTime >= current.duration + 2) {
			// let vid = current;
			console.log(ts(), 'Stopping', current.id, 'because it ended');
			current = undefined;
			io.emit('play', undefined, true);
			addToHistory('end', null);
		}
	}
	setInterval(updateCurrent, 100);

	function checkUser(user) {
		if (!user) {
			return false;
		}
		let serverUser = serverUsers[user.discordId];
		if (!serverUser) {
			return false;
		}
		let isPoop = serverUser.roles.find(role => role.name === '💩');
		if (serverUser.bot || isPoop) {
			return false;
		}
		return true;
	}

	function setCurrent(id, user) {
		if (!checkUser(user)) {
			return ACTION_FORBIDDEN;
		}
		if (!id) {
			if (current === undefined) return Promise.resolve(false);
			// let vid = current;
			console.log(ts(), 'Stopping from', user && user.username);
			current = undefined;
			io.emit('play', undefined);
			addToHistory('stop', user);
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
			addToHistory('play', user, current);
			return true;
		});
	}

	function pause(user) {
		if (!checkUser(user)) {
			return ACTION_FORBIDDEN;
		}
		updateCurrent();
		if (!current || current.paused) return;
		console.log(ts(), 'Pausing from', user && user.username);
		current.paused = true;
		io.emit('pause');
		addToHistory('pause', user);
	}
	function resume(user) {
		if (!checkUser(user)) {
			return ACTION_FORBIDDEN;
		}
		updateCurrent();
		if (!current || !current.paused) return;
		console.log(ts(), 'Resuming from', user && user.username);
		current.paused = false;
		io.emit('resume');
		addToHistory('resume', user);
	}
	function seek(time, user) {
		if (!checkUser(user)) {
			return ACTION_FORBIDDEN;
		}
		updateCurrent();
		if (!current) return;
		console.log(ts(), 'Seeking to', time, 'from', user && user.username);
		// current.paused = false;
		current.currentTime = time;
		io.emit('seek', time);
		addToHistory('seek', user, { to: time });
	}

	function handleUser(socket) {
		let headers = socket.handshake.headers;
		let ip = headers['x-real-ip'] || headers['x-forwarded-for'] || socket.request.connection.remoteAddress;

		// console.log(ts(), 'User ' + ip + ' connected');
		let user = {
			id: socket.id,
			ip: ip,
			// username: ip
			username: '????'
		};

		function checkResult(result) {
			// TODO: Promise.resolve(result)
			if (result === ACTION_FORBIDDEN) {
				socket.emit('forbidden');
			}
		}

		users[user.id] = user;
		socket.on('me', data => {
			data = data || {};
			let username = data.username;
			if (!username) return;
			user.username = username;
			user.discriminator = data.discriminator;
			user.avatar = data.avatar;
			user.discordId = data.id;

			socket.on('play', id => checkResult(setCurrent(id, user)));
			socket.on('stop', () => checkResult(setCurrent(undefined, user)));
			socket.on('pause', () => checkResult(pause(user)));
			socket.on('resume', () => checkResult(resume(user)));
			socket.on('seek', time => checkResult(seek(time, user)));
			socket.on('preference', (key, value) => {
				let update = {};
				update['data.' + key] = value;
				preferences.update({ user: username }, { $set: update }, { upsert: true });
			});

			preferences.findOne({ user: username }, (err, pref) => {
				if (err || !pref) {
					pref = { data: {} };
				}
				socket.emit('preferences', pref.data);
				socket.emit('play', current);
			});
		});
		socket.on('disconnect', () => {
			// console.log(ts(), 'User ' + ip + ' disconnected');
			delete users[user.id];
		});
	}

	io.on('connect', handleUser);
};
