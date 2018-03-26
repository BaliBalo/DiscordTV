# DiscordTV

Simultaneous youtube playback on Discord


## Roadmap

Goal features, maybe

-> V1: Anyone can play a video. Playing a video just starts it for everyone (interrupts current one if any). Close to tinychat youtube behaviour.  
-- V2: Roles ? Queue ?  
-- V3: Rooms ? Per-channel or at least per-server management.

## Installation

`public/setup.exe` edits the discord source file to automatically start the player.  
May need to be ran after every update.

## Building the installer

- `npm install -g pkg`
- `pkg installer/index.js -o public/setup`

## Manual injection

(not recommended)  
You can press `Ctrl+Shift+I` in discord to request client.js yourself.
