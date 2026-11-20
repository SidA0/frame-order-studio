importScripts('vendor/occt-import-js.js','step-split.js','mesh-section.js','step-specs.js');
let cadModule;
const bounds=mesh=>{const a=mesh.attributes.position.array,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],a[i+k]);hi[k]=Math.max(hi[k],a[i+k])}return {lo,hi}};
const boundGap=(a,b)=>a.lo.reduce((sum,v,k)=>sum+Math.abs(v-b.lo[k])+Math.abs(a.hi[k]-b.hi[k]),0);
function matchParts(sourceMeshes,parts){
  const sources=sourceMeshes.map(bounds),used=new Set(),mapping=[];
  for(const part of parts){
    const read=cadModule.ReadStepFile(part.bytes,{linearUnit:'inch',linearDeflectionType:'bounding_box_ratio',linearDeflection:0.003,angularDeflection:0.2});
    if(!read.success||read.meshes?.length!==1)throw Error(`Could not verify the geometry for ${part.name}.`);
    const target=bounds(read.meshes[0]);
    const matches=sources.map((box,i)=>({i,gap:boundGap(target,box)})).filter(x=>!used.has(x.i)).sort((a,b)=>a.gap-b.gap);
    if(!matches.length||matches[0].gap>.03)throw Error(`Source-to-part geometry mismatch for ${part.name}; no drawing was generated with an unverified number.`);
    if(matches[1]&&matches[1].gap-matches[0].gap<.002)throw Error(`Ambiguous source-to-part match for ${part.name}; exported numbering needs CAD review.`);
    mapping.push(matches[0].i);used.add(matches[0].i);
  }
  return mapping;
}
self.onmessage=async event=>{
  try{
    cadModule ||= await occtimportjs({locateFile:name=>`vendor/${name}`});
    const result=cadModule.ReadStepFile(new Uint8Array(event.data),{
      linearUnit:'inch',linearDeflectionType:'bounding_box_ratio',
      linearDeflection:0.003,angularDeflection:0.2
    });
    let parts=[],partMeshIds=[],splitError=null,specs=[],specError=null;
    if(result.success&&result.meshes?.length){
      const source=new TextDecoder().decode(event.data);
      try{parts=StepSplitter.splitStepText(source,result.meshes.length);partMeshIds=matchParts(result.meshes,parts)}
      catch(error){splitError=String(error?.message||error)}
      try{specs=StepSpecs.detectStepSpecs(source,result.meshes.length,partMeshIds.map(id=>result.meshes[id]))}
      catch(error){specError=String(error?.message||error)}
    }
    self.postMessage({ok:true,result,parts,partMeshIds,splitError,specs,specError});
  }catch(error){self.postMessage({ok:false,error:String(error?.message||error)})}
};
