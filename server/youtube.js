const request = require('request-promise-native');

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
function parseDuration(duration) {
	if (!isNaN(duration)) return +duration;
	if (typeof duration !== 'string') return 0;
	let match = duration.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)$/) || [];
	let v = n => match[n] || 0;
	return v(1) * DAY + v(2) * HOUR + v(3) * MINUTE + v(4) * SECOND;
}

function getVideoInfo(id) {
	if (!id) return Promise.reject('Invalid ID');
	return request({
		uri: 'https://www.googleapis.com/youtube/v3/videos',
		qs: {
			part: 'snippet,contentDetails',
			id: id,
			maxResults: 1,
			key: 'AIzaSyBYuupq_gOmhnuzF3wb4pRL_ZDNvZF5htc'
		},
		json: true,
	}).then(data => {
		let vid = data.items[0];
		if (!vid) return undefined;
		let duration = parseDuration(vid.contentDetails.duration);
		if (vid.snippet.liveBroadcastContent === 'live') {
			duration = Infinity;
		}
		return {
			id: vid.id,
			title: vid.snippet.title,
			channel: vid.snippet.channelTitle,
			duration: duration
		};
	});
}

module.exports = {
	getVideoInfo
};
