const path = require('path');
const request = require('request-promise-native');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ts = require('./utils/timestamp');
const config = require('./config.json');

const Datastore = require('nedb');
global.preferences = new Datastore({ filename: path.join(__dirname, 'data', 'preferences.db'), autoload: true });
global.history = new Datastore({ filename: path.join(__dirname, 'data', 'history.db'), autoload: true });

global.ioUsers = {};

require('./server')(io);

let users = {};
if (config.debugMode) {
	users = {
		bbbotmaster: Promise.resolve({
			"username": "Bali Balo",
			"discriminator": "5436",
			"mfa_enabled": false,
			"id": "125119938603122688",
			"avatar": "2779a3a810879b93f81e76c76ba59cc0"
		})
	};
}
app.get('/user-info', (req, res) => {
	const code = req.query.code;
	if (!code) {
		return res.send('{}');
	}
	if (!users[code]) {
		users[code] = request({
			method: 'POST',
			uri: 'https://discordapp.com/api/oauth2/token',
			form: {
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: 'http://discordtv.balibalo.xyz/'
			},
			headers: { Authorization: 'Basic ' + config.discordAuth }
		}).then(data => {
			if (typeof data === 'string') {
				try {
					data = JSON.parse(data);
				} catch(e) { /* */ }
			}
			if (!data || !data.access_token) {
				throw new Error('No access token ' + JSON.stringify(data));
			}
			let type = data.token_type || 'Bearer';
			const auth = type + ' ' + data.access_token;
			return request({
				method: 'GET',
				uri: 'https://discordapp.com/api/users/@me',
				headers: { Authorization: auth },
				json: true
			});
		}).catch(e => {
			let errMsg = e && e.error && e.error.error || e;
			console.log('Error getting user info', code, errMsg);
			delete users[code];
			return {};
		});
	}
	users[code].then(data => res.send(data));
});

app.get('/users.json', (req, res) => {
	res.send(global.ioUsers);
});
app.get('/preferences.json', (req, res) => {
	if (!req.query.user) {
		return res.status(400).send('{ "error": "Bad Request" }');
	}
	preferences.findOne({ user: req.query.user }, (err, pref) => {
		if (err || !pref) {
			pref = { data: {} };
		}
		res.send(pref);
	});
});

app.get('/history.json', (req, res) => {
	let query = req.query;
	let before = new Date();
	if (query.before) {
		before = new Date(+query.before || query.before);
	}
	let count = +query.count || 50;
	let at = { $lt: before };
	if (query.after) {
		at.$gt = new Date(+query.after || query.after);
	}
	let data = global.history.find({ at }).sort({ at: -1 }).limit(count).exec((err, data) => {
		res.send(data || {});
	});
});

app.use(express.static('public'));

http.listen(7410, () => {
	console.log(ts(), 'Server running');
});
