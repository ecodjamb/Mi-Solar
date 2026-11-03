import { rest } from './archive.js';

/** A missing policy must preserve monitoring, rather than accidentally silence it. */
export async function readPollPolicy({monitor=false}={}) {
  try {
    const policy=await rest('rpc/misolar_poll_policy_backend',{
      method:'POST',body:JSON.stringify({p_monitor:monitor})
    });
    if(!policy||![300,900].includes(policy.minimumSeconds)||typeof policy.runMonitor!=='boolean')throw new Error('invalid policy');
    return policy;
  }catch{
    console.warn('Adaptive polling unavailable; preserving five-minute monitoring.');
    return {visible:true,minimumSeconds:300,runMonitor:true};
  }
}
