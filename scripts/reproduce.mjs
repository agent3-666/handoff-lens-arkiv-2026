import {readTask} from '../src/arkiv.mjs';import {evaluate} from '../src/model.mjs';
const rootKey=process.argv[2];try{const r=await readTask(rootKey);console.log(JSON.stringify({...r,result:evaluate(r.records,rootKey,r.block)},null,2));}catch(e){console.error(JSON.stringify({state:'UNVERIFIABLE',message:e.shortMessage||e.message}));process.exitCode=1;}
