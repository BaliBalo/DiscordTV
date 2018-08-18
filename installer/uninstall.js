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

let discordDesktopCorePath;

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
		restore();
	} catch (e) {
		console.log('Cannot find Discord path -', e);
		waitAndExit();
	}
}

function restore() {
	try {
		let previous = fs.readdirSync(discordDesktopCorePath).map(file => {
			let match = file.match(/core_(\d+)\.asar/);
			return {
				file: file,
				ts: match && +match[1]
			};
		}).filter(e => e.ts).sort((a, b) => b.ts - a.ts)[0];
		if (!previous) throw 'original version not found';
		console.log('Using version from ' + new Date(previous.ts));
		try {
			fs.renameSync(path.join(discordDesktopCorePath, 'core.asar'), path.join(discordDesktopCorePath, 'core_dtv.asar'));
		} catch(e) {}
		fs.renameSync(path.join(discordDesktopCorePath, previous.file), path.join(discordDesktopCorePath, 'core.asar'));
		console.log('Done.');
		waitAndExit();
	} catch (e) {
		console.log('Error restoring most recent working version -', e);
		waitAndExit();
	}
}

// Start the install process
closeDiscord();
