const path = require('path');
const fs = require('fs');
const readline = require('readline');
const psList = require('ps-list');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});
const ask = question => new Promise(resolve => rl.question(question, resolve));

const isDirectory = source => fs.lstatSync(source).isDirectory();

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

function restore(discordDesktopCorePath) {
	let previous = fs.readdirSync(discordDesktopCorePath).map(file => {
		let match = file.match(/core_(\d+)\.asar/);
		return {
			file: file,
			ts: match && +match[1]
		};
	}).filter(e => e.ts).sort((a, b) => b.ts - a.ts)[0];
	if (!previous) {
		throw 'no restorable version found';
	}
	console.log('Using version from ' + new Date(previous.ts));
	fs.renameSync(path.join(discordDesktopCorePath, 'core.asar'), path.join(discordDesktopCorePath, 'core_dtv_' + Date.now() + '.asar'));
	fs.renameSync(path.join(discordDesktopCorePath, previous.file), path.join(discordDesktopCorePath, 'core.asar'));
}

// Start the uninstall process
(async function() {
	console.log('Making sure Discord is closed');
	try {
		await closeDiscord();
	} catch(e) {
		console.log('Error while trying to close Discord', e);
		let answer = await ask('[Type yes to try the uninstallation anyway, enter to exit] ');
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

	try {
		await restore(discordDesktopCorePath);
	} catch (e) {
		console.log('Error restoring most recent working version -', e);
		return waitAndExit();
	}

	console.log('Done.');
	return waitAndExit();
})();
