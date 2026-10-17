import {test} from 'node:test';import assert from 'node:assert/strict';import {walk} from '../src/arkiv.mjs';
const ent=k=>({key:k,creator:'c',owner:'o',createdAt:1n,expiresAt:5n,creationFlags:{readonly:true},attributes:{version:{type:'i32',value:1}},toJson:()=>({kind:'proposal'})});
const page=(entities,block,next)=>({entities,blockNumber:block,hasNextPage:()=>Boolean(next),next:next});const query=p=>({fetch:async()=>p,toString:()=> 'test-only query'});
test('walk consumes all pages at one block',async()=>{const p2=page([ent('b')],10n);const p1=page([ent('a')],10n,async()=>p2);const r=await walk(query(p1));assert.equal(r.records.length,2);assert.equal(r.pages.length,2);assert.equal(r.block,'10');});
test('later page network error withholds partial result',async()=>{const p=page([ent('a')],10n,async()=>{throw new Error('RPC unavailable');});await assert.rejects(walk(query(p)),/unavailable/);});
test('pagination snapshot mismatch fails closed',async()=>{const p=page([ent('a')],10n,async()=>page([ent('b')],11n));await assert.rejects(walk(query(p)),/snapshot block/);});
test('safe page budget cannot silently truncate',async()=>{const p=page([ent('a')],10n,async()=>p);await assert.rejects(walk(query(p),2),/page budget/);});
test('first page network error fails closed',async()=>{await assert.rejects(walk({fetch:async()=>{throw new Error('offline');}}),/offline/);});
test('malformed JSON payload fails closed',async()=>{const e=ent('a');e.toJson=()=>{throw new Error('bad JSON');};await assert.rejects(walk(query(page([e],10n))),/bad JSON/);});
