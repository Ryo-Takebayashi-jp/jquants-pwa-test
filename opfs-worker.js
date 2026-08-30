self.onmessage=async(e)=>{
  if(e.data?.cmd!=="test")return;
  const name="jq_direct_opfs_v7a_test.bin";
  const size=64*1024*1024;
  const t0=performance.now();
  let root,fh,ah;
  try{
    root=await navigator.storage.getDirectory();
    fh=await root.getFileHandle(name,{create:true});
    if(!fh.createSyncAccessHandle)throw new Error("createSyncAccessHandle未対応");
    ah=await fh.createSyncAccessHandle();
    ah.truncate(size);
    const points=[
      {at:0,data:new Uint8Array([74,81,55,65,1,2,3,4])},
      {at:32*1024*1024,data:new Uint8Array([9,8,7,6,5,4,3,2])},
      {at:size-8,data:new Uint8Array([11,22,33,44,55,66,77,88])}
    ];
    for(const p of points){
      const n=ah.write(p.data,{at:p.at});
      if(n!==p.data.length)throw new Error("write size mismatch");
    }
    ah.flush();
    for(const p of points){
      const b=new Uint8Array(p.data.length);
      const n=ah.read(b,{at:p.at});
      if(n!==b.length)throw new Error("read size mismatch");
      for(let i=0;i<b.length;i++)if(b[i]!==p.data[i])throw new Error("readback mismatch");
    }
    ah.close(); ah=null;
    await root.removeEntry(name);
    self.postMessage({ok:true,fileSize:size,elapsedMs:Math.round(performance.now()-t0),deleted:true});
  }catch(err){
    try{if(ah)ah.close()}catch(_){}
    try{if(root)await root.removeEntry(name)}catch(_){}
    self.postMessage({ok:false,error:String(err?.stack||err)});
  }
};