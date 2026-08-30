self.onmessage=async(e)=>{
 if(e.data?.cmd!=="test")return;
 const name="jq_v7b_direct_test.bin", size=64*1024*1024, t0=performance.now();
 let root,fh,ah;
 try{
   root=await navigator.storage.getDirectory();
   fh=await root.getFileHandle(name,{create:true});
   if(!fh.createSyncAccessHandle)throw new Error("createSyncAccessHandle未対応");
   ah=await fh.createSyncAccessHandle(); ah.truncate(size);
   const pts=[
    [0,new Uint8Array([1,2,3,4,5,6,7,8])],
    [32*1024*1024,new Uint8Array([8,7,6,5,4,3,2,1])],
    [size-8,new Uint8Array([11,22,33,44,55,66,77,88])]
   ];
   for(const [at,d] of pts){if(ah.write(d,{at})!==d.length)throw new Error("write mismatch")}
   ah.flush();
   for(const [at,d] of pts){
     const b=new Uint8Array(d.length);
     if(ah.read(b,{at})!==b.length)throw new Error("read mismatch");
     for(let i=0;i<b.length;i++)if(b[i]!==d[i])throw new Error("readback mismatch");
   }
   ah.close();ah=null;await root.removeEntry(name);
   self.postMessage({ok:true,fileSize:size,elapsedMs:Math.round(performance.now()-t0),deleted:true});
 }catch(err){
   try{if(ah)ah.close()}catch(_){}
   try{if(root)await root.removeEntry(name)}catch(_){}
   self.postMessage({ok:false,error:String(err?.stack||err)});
 }
};