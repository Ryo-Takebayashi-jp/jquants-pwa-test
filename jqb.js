const JQB_MAGIC="JQBACKUP1",te=new TextEncoder(),td=new TextDecoder();
function jqbLine(o){return te.encode(JSON.stringify(o)+"\n")}
async function jqbReadLine(f,o,max=1048576){let b=new Uint8Array(await f.slice(o,Math.min(f.size,o+max)).arrayBuffer()),i=b.indexOf(10);if(i<0)throw new Error("JQB header corrupt");return{text:td.decode(b.slice(0,i)),next:o+i+1}}
