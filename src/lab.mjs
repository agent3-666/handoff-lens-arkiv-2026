import {APP,digest} from './model.mjs';
const K=n=>'0x'+n.toString(16).padStart(64,'0'),A=n=>'0x'+n.toString(16).padStart(40,'0');
export function labScenario(mode){
 const task='demo-synthetic-lab',buyer=A(1),executor=A(2),rootKey=K(1),hash=digest('SYNTHETIC delivery version 1');
 const r=(n,kind,creator,p={})=>({key:K(n),creator,owner:creator,createdAt:String(100+n),expiresAt:'9999999',readonly:true,attributes:{app:{type:'str',value:APP},task:{type:'str',value:task},kind:{type:'str',value:kind},version:{type:'i32',value:p.version??1}},payload:{kind,task,version:1,rootKey,...p}});
 const records=[r(1,'proposal',buyer,{rootKey:null,executor}),r(2,'delivery',executor,{proposalKey:rootKey,digest:hash})];
 const a=r(3,'acceptance',buyer,{proposalKey:rootKey,deliveryKey:K(2),digest:hash});
 if(mode!=='one-sided')records.push(a);
 if(mode==='fake-buyer'){a.creator=A(3);a.payload.role='buyer';}
 if(mode==='old-version')records.push(r(4,'proposal',buyer,{version:2,executor}),r(5,'delivery',executor,{version:2,proposalKey:K(4),digest:hash}));
 if(mode==='wrong-digest')a.payload.digest=digest('SYNTHETIC wrong deliverable');
 if(mode==='conflict')records.push(r(4,'delivery',executor,{proposalKey:rootKey,digest:digest('SYNTHETIC conflicting delivery')}));
 if(mode==='expired')records[0].expiresAt='199';
 return {records,rootKey,block:'200',pages:[],query:'No RPC request. Local synthetic examples only.'};
}
