import {spawn,spawnSync} from 'node:child_process';
const children=[
 spawn(process.execPath,['server.mjs'],{stdio:'inherit'}),
 spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','0.0.0.0',...process.argv.slice(2)],{stdio:'inherit'})
];
const stop=()=>{for(const child of children){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGTERM')}};
process.on('SIGINT',()=>{stop();process.exit(0)});process.on('SIGTERM',()=>{stop();process.exit(0)});
for(const child of children)child.on('exit',code=>{if(code){stop();process.exit(code)}});
