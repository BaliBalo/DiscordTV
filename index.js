const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ts = require('utils/timestamp');

require('./server')(io);

app.use(express.static('public'))

http.listen(7410, () => {
	console.log(ts(), 'Server running');
});
