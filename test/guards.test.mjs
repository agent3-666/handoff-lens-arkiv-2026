import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {evaluate} from '../src/model.mjs';import {labScenario} from '../src/lab.mjs';
test('known-bad buyer-authority mutation is caught by the fake-buyer scenario',async()=>{
 const original=await readFile(new URL('../src/model.mjs',import.meta.url),'utf8');
 const target="if(!same(e.creator,buyer)){reject(e,'creator is not authorized buyer');continue;}";
 assert.ok(original.includes(target),'Mutation target drifted; guard must be reviewed.');
 const temp=new URL('../src/.model-guard-mutant.mjs',import.meta.url);
 try{await writeFile(temp,original.replace(target,'/* deliberately removed creator guard for negative control */'));
 const {evaluate:bad}=await import(temp.href+'?guard');const s=labScenario('fake-buyer');
 assert.equal(evaluate(s.records,s.rootKey,s.block).state,'AWAITING_ACCEPTANCE');
 assert.equal(bad(s.records,s.rootKey,s.block).state,'ACCEPTED','Known-bad implementation must trigger the false-completion symptom.');
 }finally{await unlink(temp).catch(()=>{});}
});
