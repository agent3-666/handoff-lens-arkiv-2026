import {createPublicClient} from '@arkiv-network/sdk';import {tiramisu} from '@arkiv-network/sdk/chains';import {gte} from '@arkiv-network/sdk/query';import {u64} from '@arkiv-network/sdk/attr';import {http} from 'viem';import {writeFile} from 'node:fs/promises';
const c=createPublicClient({chain:tiramisu,transport:http(undefined,{retryCount:0,timeout:12000})});
const block=await c.getBlockNumber();
const q=c.select({key:true,creator:true,createdAt:true}).where(gte('$expiresAt',u64(1n))).atBlock(block).limit(1);
const p=await q.fetch();const result={observedAt:new Date().toISOString(),query:q.toString(),count:p.entities.length,block:String(p.blockNumber),hasNext:p.hasNextPage(),first:p.entities.map(e=>({key:e.key,creator:e.creator,createdAt:String(e.createdAt)}))};
if(result.count!==1)throw new Error('Known-positive probe did not find a record.');if(p.hasNextPage()){try{const n=await p.next();result.next={count:n.entities.length,block:String(n.blockNumber),hasNext:n.hasNextPage()};if(n.blockNumber!==p.blockNumber)throw new Error('Snapshot mismatch');}catch(e){result.nextError={name:e.name,message:e.message,data:e.data};}}
await writeFile('../evidence/probe/query-positive.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
