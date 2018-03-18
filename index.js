const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

require('./server')(io);

app.use(express.static('public'))

let pad2 = n => ('0' + n).slice(-2);
let ts = (d = new Date()) => {
	let date = [d.getDate(), d.getMonth() + 1, d.getYear() % 100].map(pad2).join('/');
	let time = [d.getHours(), d.getMinutes()].map(pad2).join(':');
	return '[' + date + ' ' + time + ']';
};

http.listen(7410, () => {
	console.log(ts(), 'Server running');
});
