const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const asar = require('asar');

const extraCode = `
if (mainWindow.webContents && mainWindow.webContents.getURL().startsWith(WEBAPP_ENDPOINT)) {
  mainWindow.webContents.executeJavaScript('(d=>d.body.appendChild(d.createElement("script")).src="https://discordtv.balibalo.xyz/client.js")(document);');
}
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

const isDirectory = source => fs.lstatSync(source).isDirectory();
let discordDesktopCorePath;
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
	if (!fs.existsSync(discordDesktopCorePath)) throw 'not found';
} catch (e) {
	console.log('Cannot find Discord path');
	process.exit();
}

const discordDesktopCore = path.join(discordDesktopCorePath, 'core.asar');

const tempPath = path.join(getDataRoot(), 'DiscordTV', '__tmp');

console.log('Extracting', discordDesktopCore);
asar.extractAll(discordDesktopCore, tempPath);

let file = path.join(tempPath, 'app', 'mainScreen.js');
let data = fs.readFileSync(file, 'utf-8');
if (data.indexOf('discordtv.balibalo.xyz') !== -1) {
	console.log('Already installed');
	process.exit();
}
console.log('Adding the cusom code');
data = data.replace(/(mainWindow\.webContents\.on\('did-finish-load'[^{]+\{)/, '$1' + extraCode.replace(/\$/g, '$$$$'));
fs.writeFileSync(file, data, 'utf-8');

console.log('Recompiling');
// Move the original file as a backup
fs.renameSync(discordDesktopCore, path.join(discordDesktopCorePath, 'core_' + Date.now() + '.asar'))
asar.createPackage(tempPath, discordDesktopCore, recompiled);

function recompiled() {
	rimraf(tempPath, function () { console.log('Done'); process.exit(); });
}
