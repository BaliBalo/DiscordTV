let pad2 = n => ('0' + n).slice(-2);
module.exports = (d = new Date()) => {
	let date = [d.getDate(), d.getMonth() + 1, d.getYear() % 100].map(pad2).join('/');
	let time = [d.getHours(), d.getMinutes()].map(pad2).join(':');
	return '[' + date + ' ' + time + ']';
};
