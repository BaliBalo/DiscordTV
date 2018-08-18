const path = require('path');
const fs = require('fs');
const readline = require('readline');
const psList = require('ps-list');
const rimraf = require('rimraf');
const asar = require('asar');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

const extraCode = `
  /* DISCORDTV_START 1.2 */
  mainWindow.webContents.on('did-finish-load', function () {
    if (mainWindow.webContents && mainWindow.webContents.getURL().startsWith(WEBAPP_ENDPOINT)) {
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

function waitAndExit() {
	rl.question('[Press enter to exit]', (answer) => {
		rl.close();
		process.exit();
	});
}

let discordProcess;
function closeDiscord() {
	console.log('Making sure Discord is closed');
	psList().then(list => {
		let proc = list.find(p => p.name.toLowerCase().includes('discord'));
		if (proc) {
			process.kill(proc.pid);
		}
		getDiscordDesktopCorePath();
	}).catch(e => {
		console.log('Error while trying to close Discord', e);
		rl.question('[Type yes to try the installation anyway, enter to exit]', (answer) => {
			if (!answer || answer[0] !== 'y') {
				rl.close();
				process.exit();
				return;
			}
			getDiscordDesktopCorePath();
		});
	});
}

const tempPath = path.join(getDataRoot(), 'DiscordTV', '__tmp');
let discordDesktopCorePath;
let discordDesktopCore;

const isDirectory = source => fs.lstatSync(source).isDirectory();
function getDiscordDesktopCorePath() {
	try {
		let source = path.join(getDataRoot(), 'discord');
		let versionDirectories = fs.readdirSync(source).filter(dir => {
			if (!isDirectory(path.join(source, dir))) return false;
			return dir.match(/^\d+\.\d+(\.\d+(\.\d+)?)?$/);
		}).sort((a, b) => {
			let as = a.split('.');
			let bs = b.split('.');
			for (let i = 0, l = Math.min(as.length, bs.length); i < l; i++) {
				let d = bs[i] - as[i];
				if (d) return d;
			}
			return 0;
		});
		let mostRecent = versionDirectories[0];
		console.log('Discord version', mostRecent);
		if (!mostRecent) throw 'not found';
		discordDesktopCorePath = path.join(source, mostRecent, 'modules', 'discord_desktop_core');
		if (!fs.existsSync(discordDesktopCorePath)) throw 'discord_desktop_core not found';
		extractAsar();
	} catch (e) {
		console.log('Cannot find Discord path -', e);
		waitAndExit();
	}
}

function extractAsar() {
	discordDesktopCore = path.join(discordDesktopCorePath, 'core.asar');
	console.log('Extracting', discordDesktopCore);
	try {
		asar.extractAll(discordDesktopCore, tempPath);
		insertCode();
	} catch (e) {
		console.log('Error extracting archive -', e);
		waitAndExit();
	}
}

function insertCode() {
	try {
		let file = path.join(tempPath, 'app', 'mainScreen.js');
		let data = fs.readFileSync(file, 'utf-8');
		if (data.indexOf('discordtv.balibalo.xyz') !== -1) {
			console.log('Already installed');
			return waitAndExit();
		}
		console.log('Adding the cusom code');
		data = data.replace(/(mainWindow\.webContents\.on\('new-window')/, extraCode.replace(/\$/g, '$$') + '$1');
		fs.writeFileSync(file, data, 'utf-8');
		recompile();
	} catch (e) {
		console.log('Error adding custom code -', e);
		waitAndExit();
	}
}

function recompile() {
	console.log('Recompiling');
	try {
		// Move the original file as a backup
		fs.renameSync(discordDesktopCore, path.join(discordDesktopCorePath, 'core_' + Date.now() + '.asar'));
		asar.createPackage(tempPath, discordDesktopCore, cleanup);
	} catch (e) {
		console.log('Error recompiling discord -', e);
		waitAndExit();
	}
}

function cleanup() {
	rimraf(tempPath, function () {
		console.log('Done.');
		waitAndExit();
	});
}

// Start the install process
closeDiscord();
