import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
for(const dir of ['src','scripts','tests'])for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.mjs'))){
  const result=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(result.status!==0)process.exit(1);
}
console.log('JavaScript syntax checks passed.');
