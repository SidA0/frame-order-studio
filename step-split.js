/* Extract independent AP203/AP214 B-rep solids while preserving their original
   analytic STEP entities and shared unit/product context. */
(function(root){
  function parseEntities(source){
    const start=source.indexOf('DATA;');
    if(start<0)throw Error('No STEP DATA section was found.');
    const dataStart=start+5,end=source.indexOf('ENDSEC;',dataStart);
    if(end<0)throw Error('The STEP DATA section is incomplete.');
    const entities=new Map(),rx=/#(\d+)\s*=/g;
    rx.lastIndex=dataStart;
    let match;
    while((match=rx.exec(source))&&match.index<end){
      const id=Number(match[1]);let i=rx.lastIndex,quoted=false;
      for(;i<end;i++){
        const c=source[i];
        if(c==="'"){
          if(quoted&&source[i+1]==="'"){i++;continue}
          quoted=!quoted;
        }else if(c===';'&&!quoted)break;
      }
      if(i>=end)throw Error(`STEP entity #${id} has no closing semicolon.`);
      entities.set(id,source.slice(rx.lastIndex,i).trim());
      rx.lastIndex=i+1;
    }
    return {entities,prefix:source.slice(0,dataStart),suffix:source.slice(end)};
  }
  function splitStepText(source,expectedCount){
    const {entities,prefix,suffix}=parseEntities(source);
    const reps=[...entities].filter(([,v])=>/^ADVANCED_BREP_SHAPE_REPRESENTATION\b/.test(v));
    if(reps.length!==1)throw Error(`Expected one multi-body B-rep representation; found ${reps.length}. Export the frame as one multi-body STEP part.`);
    const [repId,rep]=reps[0];
    const listMatch=rep.match(/(ADVANCED_BREP_SHAPE_REPRESENTATION\s*\(\s*'(?:''|[^'])*'\s*,\s*)\(([^)]*)\)/);
    if(!listMatch)throw Error('The STEP body list could not be read.');
    const refs=[...listMatch[2].matchAll(/#(\d+)/g)].map(x=>Number(x[1]));
    const solidIds=refs.filter(id=>/^MANIFOLD_SOLID_BREP\b/.test(entities.get(id)||''));
    const extras=refs.filter(id=>!solidIds.includes(id));
    if(!solidIds.length)throw Error('The STEP representation contains no independent solid bodies.');
    if(expectedCount!=null&&solidIds.length!==expectedCount)throw Error(`The STEP lists ${solidIds.length} solids but the CAD reader found ${expectedCount} meshes. Body-to-drawing mapping needs review.`);
    const roots=[...entities].filter(([,v])=>/^SHAPE_DEFINITION_REPRESENTATION\b/.test(v)&&new RegExp(`#${repId}(?!\d)`).test(v)).map(([id])=>id);
    if(!roots.length)throw Error('The STEP product-to-shape link was not found.');
    const encoded=new TextEncoder(),outputs=[];
    for(let n=0;n<solidIds.length;n++){
      const solidId=solidIds[n],solid=entities.get(solidId);
      const rawName=solid.match(/^MANIFOLD_SOLID_BREP\s*\(\s*'((?:''|[^'])*)'/)?.[1]?.replace(/''/g,"'")||`Body ${n+1}`;
      const itemIds=[solidId,...extras];
      const customRep=rep.replace(listMatch[0],`${listMatch[1]}( ${itemIds.map(id=>`#${id}`).join(', ')} )`);
      const keep=new Set(),pending=[...roots];
      while(pending.length){
        const id=pending.pop();if(keep.has(id))continue;
        const value=id===repId?customRep:entities.get(id);
        if(!value)throw Error(`STEP entity #${id} is missing.`);
        keep.add(id);
        for(const ref of value.matchAll(/#(\d+)/g)){const child=Number(ref[1]);if(!keep.has(child))pending.push(child)}
      }
      const data=[...keep].sort((a,b)=>a-b).map(id=>`#${id} = ${id===repId?customRep:entities.get(id)} ;\n`).join('');
      const name=`${String(n+1).padStart(3,'0')}-${rawName.replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)||'body'}.step`;
      outputs.push({name,solidName:rawName,solidId,bytes:encoded.encode(`${prefix}\n${data}${suffix}`)});
    }
    return outputs;
  }
  root.StepSplitter={splitStepText};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.StepSplitter;
})(typeof self!=='undefined'?self:globalThis);
