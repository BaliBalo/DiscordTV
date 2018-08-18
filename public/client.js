(function() {

	let winObj = window.__DISCORDTV__;
	if (winObj && !winObj.removed) {
		winObj.remove();
	}
	winObj = window.__DISCORDTV__ = {
		removed: false,
		remove: remove
	};

	let base = 'https://discordtv.balibalo.xyz/';
	if (location.hostname === 'localhost') {
		base = '/';
	}
	let user = null;

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

	function clamp(n, m, M) {
		return n > m ? n < M ? n : M : m;
	}

	function formatTime(seconds) {
		seconds = ~~seconds;
		let s = seconds % 60;
		let minutes = ~~(seconds / 60);
		let m = minutes % 60;
		let h = ~~(minutes / 60);
		return (h ? h + ':' : '') + m + ':' + ('0' + s).slice(-2);
	}

	let socket;
	let dom = {};
	let ratio = 16 / 9;
	let preferences = {
		volume: 100,
		muted: false,
		position: [100, 30],
		anchor: ['left', 'top'],
		size: [360, 360 / ratio],
		visible: true
	};
	let minWidth = 200;
	let collapsed = true;
	let shouldControlsBeShown = false;
	let controlsShown = false;
	let controlsCollapsed = true;
	let playing;
	let player;
	let fullScreenFunc = ['requestFullScreen', 'mozRequestFullScreen', 'webkitRequestFullScreen'].find(k => k in document.body);

	function docMouseMove(e) {
		move(e);
		moveVolume(e);
		moveProgress(e);
		moveSizer(e);
	}
	function docMouseUp(e) {
		release(e);
		releaseVolume(e);
		releaseProgress(e);
		releaseSizer(e);
		if (shouldControlsBeShown !== controlsShown) {
			controlsShown = shouldControlsBeShown;
			updateControlsStatus();
		}
	}
	function docKeyDown(e) {
		let ctrl = e.ctrlKey || e.metaKey;
		let shift = e.shiftKey;
		let key = e.keyCode;
		// Control+Shift+Y
		if (ctrl && shift && key === 89) {
			toggleVisibility();
			e.preventDefault();
			return;
		}
		// Control+M
		if (ctrl && key === 77) {
			toggleMute();
			e.preventDefault();
			return;
		}
	}

	function toggleVisibility() {
		let visible = preferences.visible;
		setStyle(dom.main, {
			visibility: visible ? 'hidden' : 'visible'
		});
		updatePreference('visible', !visible);
	}

	let grabbedAt = null;
	function grab(e) {
		e.preventDefault();
		let p = dom.main.getBoundingClientRect();
		grabbedAt = [e.clientX - p.left, e.clientY - p.top];
	}
	function move(e) {
		if (!grabbedAt) return;
		e.preventDefault();
		let availWidth = Math.min(window.outerWidth, window.innerWidth);
		let availHeight = window.innerHeight;
		let width = collapsed ? 100 : preferences.size[0];
		let pos = preferences.position;
		pos[0] = clamp(e.clientX - grabbedAt[0], 0, availWidth - width);
		pos[1] = clamp(e.clientY - grabbedAt[1], 0, availHeight - 30);
		if (pos[0] > (availWidth - width) * .5) {
			preferences.anchor[0] = 'right';
			pos[0] = availWidth - pos[0] - width;
		} else {
			preferences.anchor[0] = 'left';
		}
		updatePosition();
	}
	function release() {
		if (!grabbedAt) return;
		grabbedAt = null;
		updatePreference('position', preferences.position);
		updatePreference('anchor', preferences.anchor);
	}

	function updatePosition() {
		let update = {
			left: 'auto',
			right: 'auto',
			top: 'auto',
			bottom: 'auto',
		};
		let availWidth = Math.min(window.outerWidth, window.innerWidth);
		let availHeight = window.innerHeight;
		let pX = clamp(preferences.position[0], 0, availWidth - 100);
		let pY = clamp(preferences.position[1], 0, availHeight - 30);
		update[preferences.anchor[0]] = pX + 'px';
		update[preferences.anchor[1]] = pY + 'px';
		setStyle(dom.main, update);
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
			// sendRequest('debug');
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
		if (val.match(/^[0-9a-z_-]{11}$/i)) return sendRequest(val);
		let match = val.match(/(?:[?&]v=|youtu.be\/)([0-9a-z_-]+)/i);
		if (match) {
			sendRequest(match[1]);
		}
	}
	function sendRequest(id) {
		socket.emit('play', id);
	}

	function sendPause() {
		socket.emit('pause');
	}
	function sendResume() {
		socket.emit('resume');
	}
	function sendStop() {
		socket.emit('play', null);
	}
	function sendSeek(time) {
		socket.emit('seek', time);
	}
	function updatePreference(key, value) {
		preferences[key] = value;
		socket.emit('preference', key, value);
	}

	function updateControlsStatus() {
		let height = 0;
		if (playing && (controlsShown || !controlsCollapsed)) {
			height = controlsCollapsed ? 30 : dom.controls.clientHeight;
		}
		setStyle(dom.controlsExpand, { transform: 'scaleY(' + (controlsCollapsed ? '1' : '-1') + ')' });
		setStyle(dom.controlsWrapper, { height: height + 'px' });
	}

	function refreshVolume(volume, muted) {
		if (muted === undefined && player && player.isMuted) {
			muted = player.isMuted();
		}
		if (muted !== undefined) {
			setStyle(dom.controlsMute, {
				backgroundImage: 'url(' + base + (muted ? 'mute' : 'volume') + '.png)',
			});
		}
		if (volume === undefined && player && player.getVolume) {
			volume = player.getVolume();
		}
		if (volume !== undefined) {
			setStyle(dom.controlsVolumeThumb, { left: volume + '%' });
			setStyle(dom.controlsVolumeBar, {
				backgroundSize: volume + '% 2px, 100% 2px'
			});
		}
	}

	function setFullScreen() {
		let iframe = dom.playerWrapper.querySelector('iframe');
		if (!iframe) return;
		iframe[fullScreenFunc]();
	}

	let volumeGrabbed = false;
	function grabVolume(e) {
		e.preventDefault();
		volumeGrabbed = true;
		moveVolume(e);
	}
	function moveVolume(e) {
		if (!volumeGrabbed) return;
		e.preventDefault();
		let barRect = dom.controlsVolumeBar.getBoundingClientRect();
		let percentage = 100 * clamp((e.clientX - barRect.left) / barRect.width, 0, 1);
		preferences.volume = percentage;
		setVolume(percentage);
	}
	function releaseVolume() {
		if (!volumeGrabbed) return;
		volumeGrabbed = false;
		updatePreference('volume', preferences.volume);
	}
	function setVolume(p) {
		let rounded = ~~p;
		if (player) {
			player.setVolume(rounded);
		}
		setStyle(dom.controlsVolumeThumb, { left: rounded + '%' });
		setStyle(dom.controlsVolumeBar, {
			backgroundSize: rounded + '% 2px, 100% 2px'
		});
	}

	let progressGrabbed = false;
	let grabbedTime = undefined;
	function grabProgress(e) {
		e.preventDefault();
		progressGrabbed = true;
		grabbedTime = undefined;
		moveProgress(e);
	}
	function moveProgress(e) {
		if (!progressGrabbed || !playing || !playing.duration) return;
		e.preventDefault();
		let barRect = dom.controlsProgressBar.getBoundingClientRect();
		let progress = clamp((e.clientX - barRect.left) / barRect.width, 0, 1);
		let percentage = (100 * progress) + '%';
		setStyle(dom.controlsProgressThumb, { left: percentage });
		setStyle(dom.controlsProgressBar, {
			backgroundSize: percentage + ' 2px, 100% 2px'
		});
		let time = progress * playing.duration;
		dom.controlsProgressTextCurrent.textContent = formatTime(time);
		grabbedTime = time;
		// if (player) {
		// 	player.seekTo(time, false);
		// }
	}
	function releaseProgress(e) {
		if (!progressGrabbed) return;
		progressGrabbed = false;
		if (!playing || grabbedTime === undefined) return;
		sendSeek(grabbedTime);
	}

	// TODO: handle vertical resize and maybe diagonal
	let sizerGrabbed = null;
	let sizerBounds = null;
	function grabSizer(side, e) {
		e.preventDefault();
		sizerGrabbed = side;
		let rect = dom.content.getBoundingClientRect();
		sizerBounds = {
			top: rect.top,
			left: rect.left,
			right: rect.right,
			bottom: rect.bottom,
		};
		setStyle(dom.main, { transitionProperty: 'none' });
		setStyle(dom.playerWrapper, { transitionProperty: 'none' });
		moveSizer(e);
	}
	function moveSizer(e) {
		if (!sizerGrabbed || collapsed) return;
		e.preventDefault();
		let availWidth = Math.min(window.outerWidth, window.innerWidth);
		// let availHeight = window.innerHeight;
		let pos = clamp(e.clientX, 0, availWidth);
		if (sizerGrabbed === 'left') {
			pos = Math.min(pos, sizerBounds.right - minWidth);
			if (preferences.anchor[0] === 'left') {
				preferences.position[0] = pos;
				updatePosition();
			}
		}
		if (sizerGrabbed === 'right') {
			pos = Math.max(pos, sizerBounds.left + minWidth);
			if (preferences.anchor[0] === 'right') {
				preferences.position[0] = availWidth - pos;
				updatePosition();
			}
		}
		sizerBounds[sizerGrabbed] = pos;
		let width = sizerBounds.right - sizerBounds.left;
		preferences.size[0] = width;
		preferences.size[1] = width / ratio;

		updateSize();
	}
	function releaseSizer(e) {
		if (!sizerGrabbed) return;
		sizerGrabbed = false;
		updatePreference('size', preferences.size);
		updatePreference('position', preferences.position);
		setStyle(dom.main, { transitionProperty: 'width' });
		setStyle(dom.playerWrapper, { transitionProperty: 'height' });
	}

	function updateSize() {
		let sizeO = preferences.size;
		let playerStyle = { width: sizeO[0] + 'px', height: sizeO[1] + 'px' };
		setStyle(dom.player, playerStyle);
		setStyle(dom.playerWrapper.querySelector('iframe'), playerStyle);
		if (!collapsed) {
			setStyle(dom.main, { width: sizeO[0] + 'px' });
			setStyle(dom.playerWrapper, { height: sizeO[1] + 'px' });
		}
	}

	function toggleMute() {
		let muted = preferences.muted;
		if (player && player.mute) {
			player[muted ? 'unMute' : 'mute']();
		}
		refreshVolume(undefined, !muted);
		updatePreference('muted', !muted);
	}

	// TODO createBar function used for volume + progress
	// Fun little function here, code folding recommended
	function createElements() {
		dom.main = create({
			position: 'absolute',
			left: '0',
			top: '0',
			width: '100px',
			fontFamily: 'sans-serif',
			transition: 'width .25s',
			userSelect: 'none',
			zIndex: '100',
			visibility: 'hidden'
		});
		dom.topBar = create({
			display: 'flex',
			flexFlow: 'row nowrap',
			height: '30px',
			background: '#111',
			color: '#fff',
			cursor: 'move',
			'borderRadius': '6px 5px 0 0',
			// overflow: 'hidden'
		});
		dom.topBar.addEventListener('mousedown', grab);
		dom.requestButton = create('button', {
			flex: '0 0 auto',
			width: '30px',
			height: '30px',
			background: '#c62326 url(' + base + 'youtube.png) center / contain no-repeat',
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
			background: 'url(' + base + 'link.png) center / auto 75% no-repeat',
			transition: 'width .25s'
		});
		dom.link.addEventListener('mousedown', e => e.stopPropagation());
		dom.link.target = '_blank';
		// dom.link.href = 'https://www.youtube.com/watch?v=6Ppk-lfuNB8';
		dom.content = create({ position: 'relative' });
		dom.playerWrapper = create({
			position: 'relative',
			height: '0',
			overflow: 'hidden',
			transition: 'height .25s'
		});
		dom.player = create({
			position: 'absolute',
			left: '0',
			bottom: '0',
			width: preferences.size[0] + 'px',
			height: preferences.size[1] + 'px',
			background: 'black',
			pointerEvents: 'none'
		});
		dom.player.id = 'discordtv-player';
		// player has pointer-events none so set the evemt on the parent
		dom.playerWrapper.addEventListener('dblclick', setFullScreen);
		dom.controlsWrapper = create({
			position: 'absolute',
			top: '100%',
			left: '0',
			width: '100%',
			height: '0',
			overflow: 'hidden',
			transition: 'height .25s'
		});
		dom.controls = create({
			position: 'absolute',
			left: '0',
			bottom: '0',
			width: '100%',
			// height: '60px',
			display: 'flex',
			flexFlow: 'column-reverse nowrap',
			background: '#7289da',
			color: 'white',
			borderRadius: '0 0 5px 4px'
		});
		let controlsLine = {
			display: 'flex',
			flexFlow: 'row nowrap',
		};
		let controlsButton = {
			flex: '0 0 auto',
			width: '30px',
			height: '30px',
			cursor: 'pointer',
			border: 'none',
			outline: 'none',
			backgroundColor: 'transparent',
			backgroundPosition: 'center',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto 16px',
		};
		dom.controlsLine1 = create(controlsLine);
		dom.controlsMute = create('button', Object.assign({}, controlsButton, {
			backgroundImage: 'url(' + base + 'volume.png)',
		}));
		dom.controlsMute.addEventListener('click', toggleMute);
		dom.controlsVolume = create({
			flex: '1 1 auto',
			margin: '0 5px'
		});
		dom.controlsVolumeBar = create({
			position: 'relative',
			width: '100%',
			height: '30px',
			backgroundImage: 'linear-gradient(#fff, #fff), linear-gradient(rgba(255,255,255,.5), rgba(255,255,255,.5))',
			backgroundPosition: 'left center',
			backgroundSize: '100% 2px, 100% 2px',
			backgroundRepeat: 'no-repeat',
		});
		dom.controlsVolumeThumb = create({
			position: 'absolute',
			left: '100%',
			top: '50%',
			width: '10px',
			height: '10px',
			background: '#fff',
			borderRadius: '50%',
			cursor: 'ew-resize',
			margin: '-5px -6px',
		});
		dom.controlsVolumeBar.addEventListener('mousedown', grabVolume);
		dom.controlsFullScreen = create('button', Object.assign({}, controlsButton, {
			backgroundImage: 'url(' + base + 'fullscreen.png)',
		}));
		dom.controlsFullScreen.addEventListener('click', setFullScreen);
		dom.controlsExpand = create('button', Object.assign({}, controlsButton, {
			backgroundImage: 'url(' + base + 'expand-down.png)'
		}));
		dom.controlsLine2 = create(controlsLine);
		dom.controlsPause = create('button', Object.assign({}, controlsButton, {
			backgroundImage: 'url(' + base + 'pause.png)'
		}));
		dom.controlsPause.addEventListener('click', () => {
			if (!playing) return;
			(playing.paused ? sendResume : sendPause)();
		});
		dom.controlsStop = create('button', Object.assign({}, controlsButton, {
			backgroundImage: 'url(' + base + 'stop.png)'
		}));;
		dom.controlsStop.addEventListener('click', sendStop);
		dom.controlsProgress = create({
			flex: '1 1 auto',
			margin: '0 10px'
		});
		dom.controlsProgressBar = create({
			position: 'relative',
			width: '100%',
			height: '30px',
			backgroundImage: 'linear-gradient(#fff, #fff), linear-gradient(rgba(255,255,255,.5), rgba(255,255,255,.5))',
			backgroundPosition: 'left center',
			backgroundSize: '0% 2px, 100% 2px',
			backgroundRepeat: 'no-repeat',
		});
		dom.controlsProgressBar.addEventListener('mousedown', grabProgress);
		dom.controlsProgressThumb = create({
			position: 'absolute',
			left: '0%',
			top: '50%',
			width: '10px',
			height: '10px',
			background: '#fff',
			borderRadius: '50%',
			cursor: 'ew-resize',
			margin: '-5px -6px',
		});
		dom.controlsProgressText = create({
			display: 'flex',
			flexFlow: 'row nowrap',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '0 3px',
			flex: '0 0 auto',
			whiteSpace: 'nowrap',
			fontFamily: 'monospace',
			cursor: 'default'
		});
		dom.controlsProgressTextCurrent = create('span');
		dom.controlsProgressTextSep = create('span', { padding: '0 3px' });
		dom.controlsProgressTextTotal = create('span');
		dom.controlsProgressTextCurrent.textContent = formatTime(0);
		dom.controlsProgressTextSep.textContent = ' / ';
		dom.controlsProgressTextTotal.textContent = formatTime(0);
		let hSizer = {
			position: 'absolute',
			top: '0',
			width: '5px',
			height: '100%',
			cursor: 'ew-resize',
		};
		dom.sizerLeft = create(Object.assign({}, hSizer, {
			left: '-4px'
		}));
		dom.sizerRight = create(Object.assign({}, hSizer, {
			right: '-4px'
		}));
		dom.sizerLeft.addEventListener('mousedown', grabSizer.bind(null, 'left'));
		dom.sizerRight.addEventListener('mousedown', grabSizer.bind(null, 'right'));

		dom.controlsExpand.addEventListener('click', () => {
			controlsCollapsed = !controlsCollapsed;
			updateControlsStatus();
		});
		dom.content.addEventListener('mouseenter', () => {
			shouldControlsBeShown = true;
			if (controlsShown || grabbedAt || volumeGrabbed || progressGrabbed || sizerGrabbed) return;
			controlsShown = true;
			updateControlsStatus();
		});
		dom.content.addEventListener('mouseleave', () => {
			shouldControlsBeShown = false;
			if (!controlsShown || grabbedAt || volumeGrabbed || progressGrabbed || sizerGrabbed) return;
			controlsShown = false;
			// controlsCollapsed = true;
			updateControlsStatus();
		});

		document.addEventListener('mousemove', docMouseMove);
		document.addEventListener('mouseup', docMouseUp);
		window.addEventListener('resize', updatePosition);

		dom.topBar.appendChild(dom.requestButton);
		dom.info.appendChild(dom.title);
		dom.info.appendChild(dom.user);
		dom.topBar.appendChild(dom.info);
		dom.topBar.appendChild(dom.link);
		dom.main.appendChild(dom.topBar);

		dom.playerWrapper.appendChild(dom.player);
		dom.content.appendChild(dom.playerWrapper);

		dom.controlsLine1.appendChild(dom.controlsMute);
		dom.controlsVolume.appendChild(dom.controlsVolumeBar);
		dom.controlsVolumeBar.appendChild(dom.controlsVolumeThumb);
		dom.controlsLine1.appendChild(dom.controlsVolume);
		dom.controlsLine1.appendChild(dom.controlsFullScreen);
		dom.controlsLine1.appendChild(dom.controlsExpand);
		dom.controls.appendChild(dom.controlsLine1);

		dom.controlsLine2.appendChild(dom.controlsPause);
		dom.controlsLine2.appendChild(dom.controlsStop);
		dom.controlsProgressBar.appendChild(dom.controlsProgressThumb);
		dom.controlsProgress.appendChild(dom.controlsProgressBar);
		dom.controlsLine2.appendChild(dom.controlsProgress);
		dom.controlsProgressText.appendChild(dom.controlsProgressTextCurrent);
		dom.controlsProgressText.appendChild(dom.controlsProgressTextSep);
		dom.controlsProgressText.appendChild(dom.controlsProgressTextTotal);
		dom.controlsLine2.appendChild(dom.controlsProgressText);
		dom.controls.appendChild(dom.controlsLine2);

		dom.controlsWrapper.appendChild(dom.controls);
		dom.content.appendChild(dom.controlsWrapper);

		dom.content.appendChild(dom.sizerLeft);
		dom.content.appendChild(dom.sizerRight);

		dom.main.appendChild(dom.content);

		updatePosition();
		document.body.appendChild(dom.main);
	}

	function stopVideo() {
		playing = null;
		collapsed = true;
		if (sizerGrabbed) {
			releaseSizer();
		}
		updateControlsStatus();
		dom.title.textContent = '';
		dom.user.textContent = '';
		dom.controlsProgressTextCurrent.textContent = formatTime(0);
		dom.controlsProgressTextTotal.textContent = formatTime(0);
		setStyle(dom.link, { width: '0', transitionDelay: '0s' });
		setStyle(dom.main, { width: '100px', transitionDelay: '.25s' });
		setStyle(dom.playerWrapper, { height: '0', transitionDelay: '0s' });
		setStyle(dom.controlsProgressThumb, { left: '0%' });
		setStyle(dom.controlsProgressBar, {
			backgroundSize: '0% 2px, 100% 2px'
		});
		if (player) {
			player.destroy();
			player = null;
		}
	}

	function playVideo(data, soft) {
		let receivedAt = Date.now();
		if (!data || !data.id || (data.duration && data.currentTime >= data.duration)) {
			// stopVideo();
			if (!soft) {
				stopVideo();
			}
			return;
		}
		playing = data;
		collapsed = false;
		dom.title.textContent = data.title;
		let user = data.startedBy && data.startedBy.username || '';
		dom.user.textContent = user;
		dom.link.href = 'https://www.youtube.com/watch?v=' + data.id;
		if (data.duration) {
			dom.controlsProgressTextCurrent.textContent = formatTime(data.currentTime);
			dom.controlsProgressTextTotal.textContent = formatTime(data.duration);
		} else {
			dom.controlsProgressTextCurrent.textContent = 'live';
			dom.controlsProgressTextTotal.textContent = 'live';
		}
		setStyle(dom.link, { width: '30px', transitionDelay: '.25s' });
		setStyle(dom.main, { width: preferences.size[0] + 'px', transitionDelay: '0s' });
		setStyle(dom.playerWrapper, { height: preferences.size[1] + 'px', transitionDelay: '.25s' });
		setStyle(dom.controlsPause, { backgroundImage: 'url(' + base + (data.paused ? 'play' : 'pause') + '.png)' });
		updateControlsStatus();
		if (player) {
			player.destroy();
		}
		let playerVars = {
			// Disable autoplay to ba able to adjust the volume before playing
			autoplay: 0,
			// autoplay: data.paused ? 0 : 1,
			controls: 0,
			disablekb: 1,
			modestbranding: 1,
			rel: 0,
			showinfo: 0,
			iv_load_policy: 3
		};
		if (data.duration) {
			playerVars.start = Math.round(data.currentTime);
		}
		player = new YT.Player(dom.player.id, {
			videoId: data.id,
			playerVars: playerVars,
			events: {
				onReady: () => {
					if (!player) return;
					let volume = preferences.volume || 1;
					player.setVolume(~~volume);
					let muted = preferences.muted;
					if (muted) {
						player.mute();
					}
					refreshVolume(volume, muted);
					let now = Date.now();
					let delta = (now - receivedAt) / 1000;
					if (!data.paused) {
						if (data.duration && (data.currentTime || delta > 3)) {
							// Adjust time based based on how long it took to get ready
							player.seekTo(data.currentTime + delta, true);
						}
						player.playVideo();
					}
				},
				onStateChange: event => {
					if (event.data === YT.PlayerState.ENDED) {
						stopVideo();
					}
				}
			}
		});
	}
	function gotPause() {
		if (!playing || playing.paused) return;
		playing.paused = true;
		setStyle(dom.controlsPause, { backgroundImage: 'url(' + base + 'play.png)' });
		if (player && player.pauseVideo) {
			player.pauseVideo();
		}
	}
	function gotResume() {
		if (!playing || !playing.paused) return;
		playing.paused = false;
		setStyle(dom.controlsPause, { backgroundImage: 'url(' + base + 'pause.png)' });
		if (player && player.playVideo) {
			player.playVideo();
		}
	}
	function gotSeek(time) {
		if (!playing || !player || !player.seekTo) return;
		player.seekTo(time, true);
	}

	function refreshProgress() {
		if (!playing || !player) return;
		if (!progressGrabbed && player.getCurrentTime) {
			let current = 0;
			let progress = 1;
			if (playing.duration) {
				current = player.getCurrentTime();
				progress = clamp(current / playing.duration, 0, 1);
				dom.controlsProgressTextCurrent.textContent = formatTime(current);
			}
			let percentage = progress * 100 + '%';
			setStyle(dom.controlsProgressThumb, { left: percentage });
			setStyle(dom.controlsProgressBar, {
				backgroundSize: percentage + ' 2px, 100% 2px'
			});
		}
	}

	function ready() {
		if (!socket) return;
		createElements();
		setInterval(refreshProgress, 500);
		socket.on('play', playVideo);
		socket.on('pause', gotPause);
		socket.on('resume', gotResume);
		socket.on('seek', gotSeek);
		socket.on('preferences', pref => {
			Object.assign(preferences, pref);
			document.addEventListener('keydown', docKeyDown);
			updatePosition();
			updateSize();
			setStyle(dom.main, { visibility: preferences.visible ? 'visible' : 'hidden' });
		});
		sendMe();
		socket.on('reconnect', sendMe);
	}

	function sendMe() {
		if (!user) return;
		socket.emit('me', user);
	}

	function remove() {
		if (winObj.removed) return;
		if (player) {
			player.destroy();
			player = null;
		}
		try {
			document.removeEventListener('mousemove', docMouseMove);
			document.removeEventListener('mouseup', docMouseUp);
			document.removeEventListener('keydown', docKeyDown);
			window.removeEventListener('resize', updatePosition);
			document.body.removeChild(dom.main);
		} catch(e) {
			console.log('Could not remove from dom', e);
		}
		winObj.removed = true;
	}

	window.onYouTubeIframeAPIReady = function() {
		let callback = () => {
			socket = io(base);
			ready();
		};
		if (window.io) {
			return callback();
		}
		loadScript(base + 'socket.io/socket.io.js', callback);
	}

	function getUtilsModule() {
		let val = undefined;
		let found = [...Array(5000)].findIndex((e,i) => {
			try {
				let val = webpackJsonp.push([[], [], [[i]]]);
				return val && typeof val.getCurrentUser === 'function';
			} catch(e) {}
		});
		return found === undefined ? null : val;
	}

	function getUser() {
		if (window.__DISCORD_USER__) {
			return window.__DISCORD_USER__;
		}
		let currentUser;
		let utils = getUtilsModule();
		if (utils) {
			currentUser = utils.getCurrentUser();
		}
		if (!currentUser) {
			let $name = document.querySelector('.username');
			let name = $name && $name.textContent;
			if (name) {
				currentUser = {
					username: name
				};
			}
		}
		return currentUser;
	}

	function tryGetUser(attempt) {
		attempt = attempt || 0;
		if (attempt >= 10) return;
		user = getUser();
		if (user) return gotUser();
		setTimeout(() => tryGetUser(++attempt), 1000);
	}
	function gotUser() {
		if (window.YT) {
			return window.onYouTubeIframeAPIReady();
		}
		loadScript('https://www.youtube.com/iframe_api');
	}
	tryGetUser();

})();
