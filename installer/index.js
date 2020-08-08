const path = require('path');
const fs = require('fs');
const util = require('util');
const readline = require('readline');
const psList = require('ps-list');
const rimrafCB = require('rimraf');
const asar = require('asar');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

const rimraf = util.promisify(rimrafCB);
const ask = question => new Promise(resolve => rl.question(question, resolve));

const isDirectory = source => fs.lstatSync(source).isDirectory();

const extraCode = `
  /* DISCORDTV_START 1.2 */
  mainWindow.webContents.on('did-finish-load', function () {
    if (mainWindow && mainWindow.webContents && mainWindow.webContents.getURL().startsWith(WEBAPP_ENDPOINT)) {
      mainWindow.webContents.executeJavaScript('(d=>d.body.appendChild(d.createElement("script")).src="https://discordtv.balibalo.xyz/client.js")(document);');
    }
  });
  mainWindow.webContents.session.webRequest.onHeadersReceived(function (details, callback) {
    var resHeaders = details.responseHeaders || {};
    delete resHeaders['content-security-policy'];
    callback({
      cancel: false,
      responseHeaders: resHeaders
    });
  });
  /* DISCORDTV_END */

`;

function wait(time) { return new Promise(r => setTimeout(r, time)); }

function exit() {
	rl.close();
	process.exit();
}
async function waitAndExit() {
	await ask('[Press enter to exit]');
	exit();
}

function getDataRoot() {
	switch (process.platform) {
		case 'darwin':
			return path.join(process.env.HOME, 'Library', 'Application Support');
		case 'win32':
			return process.env.APPDATA;
		case 'linux':
			return process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, '.config');
	}
}

async function closeDiscord() {
	let list = await psList();
	let procs = list.filter(p => p.name.toLowerCase().includes('discord'));
	if (procs.length) {
		procs.forEach(proc => process.kill(proc.pid));
		// Wait until discord is actually killed
		//   (we only sent kill signals, doesn't guarantee anything)
		//   could check the process list again and wait for it to disappear
		await wait(1000);
	}
}

async function getDiscordDesktopCorePath() {
	let source = path.join(getDataRoot(), 'discord');
	let versionDirectories = fs.readdirSync(source).filter(dir => (
		isDirectory(path.join(source, dir)) && dir.match(/^\d+\.\d+(\.\d+(\.\d+)?)?$/)
	)).sort((a, b) => {
		// Sort by version
		let as = a.split('.');
		let bs = b.split('.');
		for (let i = 0, l = Math.min(as.length, bs.length); i < l; i++) {
			let d = bs[i] - as[i];
			if (d) {
				return d;
			}
		}
		return 0;
	});
	let mostRecent = versionDirectories[0];
	if (!mostRecent) {
		throw 'discord version not found';
	}
	console.log('Discord version', mostRecent);
	let dir = path.join(source, mostRecent, 'modules', 'discord_desktop_core');
	if (!fs.existsSync(dir)) {
		throw 'discord_desktop_core not found';
	}
	return dir;
}

function insertCode(tempPath) {
	let file = path.join(tempPath, 'app', 'mainScreen.js');
	let data = fs.readFileSync(file, 'utf-8');
	if (data.indexOf('discordtv.balibalo.xyz') !== -1) {
		throw 'already installed';
	}
	let position = data.indexOf('mainWindow.webContents.on(\'new-window\'');
	if (position === -1) {
		throw 'unable to locate startup code';
	}
	data = data.slice(0, position) + extraCode + data.slice(position);
	fs.writeFileSync(file, data, 'utf-8');
}

// Start the install process
(async function() {
	console.log('Making sure Discord is closed');
	try {
		await closeDiscord();
	} catch(e) {
		console.log('Error while trying to close Discord', e);
		let answer = await ask('[Type yes to try the installation anyway, enter to exit] ');
		if (!answer || answer[0] !== 'y') {
			return exit();
		}
	}

	let discordDesktopCorePath;
	try {
		discordDesktopCorePath = await getDiscordDesktopCorePath();
	} catch(e) {
		console.log('Cannot find Discord path -', e);
		return waitAndExit();
	}

	let discordDesktopCore = path.join(discordDesktopCorePath, 'core.asar');
	const tempPath = path.join(getDataRoot(), 'DiscordTV', '__tmp');
	console.log('Extracting', discordDesktopCore);
	try {
		await asar.extractAll(discordDesktopCore, tempPath);
	} catch (e) {
		console.log('Error extracting archive -', e);
		return waitAndExit();
	}

	console.log('Adding the custom code');
	try {
		await insertCode(tempPath);
	} catch (e) {
		console.log('Error adding custom code -', e);
		return waitAndExit();
	}

	console.log('Recompiling');
	try {
		// Move the original file as a backup (used for uninstaller)
		fs.renameSync(discordDesktopCore, path.join(discordDesktopCorePath, 'core_' + Date.now() + '.asar'));
		await asar.createPackage(tempPath, discordDesktopCore);
	} catch (e) {
		console.log('Error recompiling discord -', e);
		return waitAndExit();
	}

	// cleanup
	await rimraf(tempPath);
	console.log('Done.');
	return waitAndExit();
})();
