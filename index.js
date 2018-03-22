const request = require('request-promise-native');
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ts = require('./utils/timestamp');
const config = require('./config.json');

require('./server')(io);

let users = {};
app.get('/user-info', (req, res) => {
	const code = req.query.code;
	if (!code) {
		return res.send('{}');
	}
	if (!users[code]) {
		users[code] = request({
			method: 'POST',
			uri: 'https://discordapp.com/api/oauth2/token',
			qs: {
				grant_type: 'authorization_code',
				code: code,
				redirect_uri: 'http://discordtv.balibalo.xyz/'
			},
			headers: {
				Authorization: 'Basic ' + config.discordAuth,
			},
			json: true
		}).then(data => {
			const token = data.access_token;
			return request({
				method: 'POST',
				uri: 'https://discordapp.com/api/oauth2/token',
				qs: {
					grant_type: 'authorization_code',
					code: code,
					redirect_uri: 'http://discordtv.balibalo.xyz/'
				},
				headers: {
					Authorization: 'Basic ' + config.discordAuth,
				},
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

app.use(express.static('public'));

http.listen(7410, () => {
	console.log(ts(), 'Server running');
});
