import './style.css';
import {evaluate,digest,same} from './model.mjs';
import {readTask,client,entityInput,injectedWallet} from './arkiv.mjs';
import {labScenario} from './lab.mjs';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='live',observation=null,account=null,provider=null,latest=null,queryGeneration=0;
const title={ACCEPTED:'Buyer accepted this delivery',AWAITING_ACCEPTANCE:'Delivery claimed. Not yet accepted.',AWAITING_DELIVERY:'Waiting for an authorized delivery',CONFLICT:'Conflicting statements. Review required.',UNVERIFIABLE:'Cannot verify this handoff'};
function notice(text,reason,tone='idle'){$('#decision').textContent=text;$('#reason').textContent=reason;$('#result').className='result '+tone;}
function reset(){observation=null;latest=null;$('#records').replaceChildren();$('#facts').hidden=true;$('#query-output').textContent='No query run.';$('#source-badge').textContent=mode==='live'?'Not queried':'SYNTHETIC / LOCAL';}
function render(data){
 const result=evaluate(data.records,data.rootKey??data.root.key,data.block);observation={source:mode==='live'?'live-arkiv':'local-synthetic',observedAt:new Date().toISOString(),...data,result};latest=mode==='live'?observation:null;
 notice(title[result.state],result.reason,result.state==='ACCEPTED'?'good':result.state==='UNVERIFIABLE'?'error':'warn');
 $('#source-badge').textContent=mode==='live'?`LIVE · BLOCK ${data.block}`:'SYNTHETIC / LOCAL';
 $('#facts').hidden=false;$('#facts').innerHTML=`<div>BUYER · ON-CHAIN CREATOR<strong>${esc(result.buyer??'Unverifiable')}</strong></div><div>AUTHORIZED EXECUTOR<strong>${esc(result.executor??'Unverifiable')}</strong></div><div>VERSION / SNAPSHOT<strong>${esc(result.version??'?')} / block ${esc(data.block)}</strong></div>`;
 $('#records').innerHTML=data.records.map(e=>{const rejection=result.rejected.find(r=>same(r.key,e.key));return `<article class="record ${rejection?'rejected':''}"><span class="pill">${rejection?'EXCLUDED':'AVAILABLE RECORD'}</span><h4>${esc(e.payload?.kind)} · v${esc(e.payload?.version)}</h4><p class="micro">Immutable creator</p><code>${esc(e.creator)}</code><p class="micro">Entity key</p><code>${esc(e.key)}</code>${mode==='live'?`<a href="https://tiramisu.explorer.arkiv.network/address/${esc(e.creator)}" target="_blank" rel="noreferrer">Inspect creator on explorer ↗</a>`:''}<p class="micro">Readonly / expires at block</p><code>${esc(e.readonly)} / ${esc(e.expiresAt)}</code>${rejection?`<p class="why">${esc(rejection.reason)}</p>`:''}<details><summary>Exact payload</summary><pre>${esc(JSON.stringify(e.payload,null,2))}</pre></details></article>`;}).join('');
 $('#query-output').textContent=JSON.stringify({source:observation.source,rpc:mode==='live'?'https://rpc.tiramisu.db-chain.testnet.arkiv.network':'none',query:data.query,block:data.block,pages:data.pages,rootKey:data.rootKey??data.root.key,records:data.records.length},null,2);
}
function lab(){reset();render(labScenario($('#scenario').value));}
function switchMode(next){queryGeneration++;$('#inspect').disabled=false;mode=next;$('#live-controls').hidden=mode!=='live';$('#lab-controls').hidden=mode!=='lab';$('#live-mode').classList.toggle('active',mode==='live');$('#lab-mode').classList.toggle('active',mode==='lab');$('#mode-label').textContent=mode==='live'?'LIVE NETWORK · NO FIXTURE FALLBACK':'LOCAL SYNTHETIC INPUTS · NO NETWORK';$('#workspace-title').textContent=mode==='live'?'Inspect a handoff':'Put completion claims to the test';reset();if(mode==='lab')lab();else notice('No decision yet','Query a root proposal to inspect the available records at one snapshot block.');}
$('#live-mode').onclick=()=>switchMode('live');$('#lab-mode').onclick=()=>switchMode('lab');$('#scenario').onchange=lab;
async function inspect(){const generation=++queryGeneration;reset();notice('Querying Arkiv…','All pages must succeed at one snapshot block.');$('#inspect').disabled=true;try{const data=await readTask($('#root').value.trim());if(generation!==queryGeneration||mode!=='live')return;render({...data,rootKey:data.root.key});}catch(e){if(generation!==queryGeneration||mode!=='live')return;notice('Cannot verify this handoff',e.shortMessage??e.message,'error');$('#source-badge').textContent='LIVE QUERY FAILED';}finally{if(generation===queryGeneration)$('#inspect').disabled=false;}}
$('#inspect').onclick=inspect;$('#root').onkeydown=e=>{if(e.key==='Enter')inspect();};
$('#download').onclick=()=>{if(!observation)return;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(observation,null,2)],{type:'application/json'}));a.href=url;a.download='handoff-lens-observation.json';a.click();URL.revokeObjectURL(url);};
$('#connect').onclick=async()=>{try{provider=window.ethereum;if(!provider)throw new Error('No injected wallet. Open in a test wallet browser.');[account]=await provider.request({method:'eth_requestAccounts'});const id=await provider.request({method:'eth_chainId'});if(Number(id)!==7738577)throw new Error('Select Tiramisu chain 7738577 in your wallet.');$('#wallet-state').textContent=' '+account;}catch(e){$('#write-status').textContent=e.message;}};
async function write(kind){
 try{
  if(!provider||!account)throw new Error('Connect a Tiramisu test wallet first.');const [current]=await provider.request({method:'eth_accounts'});if(!same(account,current))throw new Error('Wallet account changed. Reconnect first.');if(Number(await provider.request({method:'eth_chainId'}))!==7738577)throw new Error('Wrong chain. Select Tiramisu 7738577.');
  let payload;
  if(kind==='proposal'){
   const executor=$('#executor').value.trim();if(!/^0x[0-9a-f]{40}$/i.test(executor)||same(executor,account))throw new Error('Use a different valid synthetic executor wallet.');
   payload={kind,version:1,rootKey:null,task:'demo-'+crypto.randomUUID(),executor,summary:'SYNTHETIC test handoff: produce a numbered test report.'};
  }else{
   if(mode!=='live'||!latest||Date.now()-Date.parse(latest.observedAt)>60000)throw new Error('Inspect a live root again before writing.');
   const r=latest.result;if(!r.proposal)throw new Error('No unambiguous current proposal.');
   payload={kind,task:r.task,version:r.version,rootKey:r.rootKey,proposalKey:r.proposal.key,digest:digest('SYNTHETIC numbered test report v'+r.version)};
   if(kind==='delivery'&&!same(account,r.executor))throw new Error('Only the authorized executor may claim delivery.');
   if(kind==='acceptance'){
    if(!same(account,r.buyer))throw new Error('Only the root buyer may accept.');if(r.state!=='AWAITING_ACCEPTANCE'||!r.deliveries.length)throw new Error('No single uncontested delivery to accept.');payload.deliveryKey=r.deliveries[0].key;payload.digest=r.deliveries[0].payload.digest;
   }
  }
  $('#write-status').textContent='Awaiting test-wallet approval. Synthetic public record only.';
  const result=await injectedWallet(provider,account).createEntity(entityInput(payload));$('#write-status').textContent='Created on Tiramisu. Transaction: '+result.txHash;
  if(kind==='proposal')$('#root').value=result.entityKey;switchMode('live');await inspect();
 }catch(e){$('#write-status').textContent=e.shortMessage??e.message;}
}
$('#create').onclick=()=>write('proposal');$('#deliver').onclick=()=>write('delivery');$('#accept').onclick=()=>write('acceptance');
try{const response=await fetch(import.meta.env.BASE_URL+'evidence/manifest.json');if(response.ok){const manifest=await response.json();for(const example of manifest.scenarios??[]){const b=document.createElement('button');b.textContent=example.label;b.onclick=()=>{$('#root').value=example.rootKey;inspect();};$('#examples').append(b);}}}catch{/* optional discovery manifest failure never becomes business data */}
