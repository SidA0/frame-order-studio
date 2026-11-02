/* Conservative tube-profile and bend detection from exact STEP B-rep surfaces. */
(function(root){
  const refRx=/#(\d+)/g;
  function entitiesOf(source){
    const values=new Map(),start=source.indexOf('DATA;'),end=source.indexOf('ENDSEC;',start+5);
    if(start<0||end<0)throw Error('STEP DATA section is missing.');
    const rx=/#(\d+)\s*=/g;rx.lastIndex=start+5;let match;
    while((match=rx.exec(source))&&match.index<end){let pos=rx.lastIndex,quoted=false;
      for(;pos<end;pos++){const char=source[pos];if(char==="'"){if(quoted&&source[pos+1]==="'"){pos++;continue}quoted=!quoted}else if(char===';'&&!quoted)break}
      values.set(Number(match[1]),source.slice(rx.lastIndex,pos).trim());rx.lastIndex=pos+1;
    }
    return values;
  }
  function references(text){return [...text.matchAll(refRx)].map(match=>Number(match[1]))}
  function unitScale(values){
    const context=[...values.values()].find(value=>value.includes('GLOBAL_UNIT_ASSIGNED_CONTEXT'))||'';
    const lengthId=Number(context.match(/GLOBAL_UNIT_ASSIGNED_CONTEXT\s*\(\s*\(\s*#(\d+)/)?.[1]);
    const unit=values.get(lengthId)||'';
    if(/CONVERSION_BASED_UNIT\s*\(\s*'INCH'/i.test(unit))return 1;
    if(/CONVERSION_BASED_UNIT\s*\(\s*'FOOT'/i.test(unit))return 12;
    if(/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\./i.test(unit))return 1/25.4;
    if(/SI_UNIT\s*\(\s*\.CENTI\.\s*,\s*\.METRE\./i.test(unit))return 1/2.54;
    if(/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\./i.test(unit))return 1000/25.4;
    return null;
  }
  function tuple(value){const list=value?.match(/\(\s*([-+\d.Ee]+)\s*,\s*([-+\d.Ee]+)\s*,\s*([-+\d.Ee]+)\s*\)\s*\)/);return list?list.slice(1).map(Number):null}
  function axis(values,id){const value=values.get(id)||'',ids=references(value),point=tuple(values.get(ids[0])),direction=tuple(values.get(ids[1]));if(!point||!direction)return null;const magnitude=Math.hypot(...direction)||1;return {point,direction:direction.map(x=>x/magnitude)}}
  function sameLine(a,b,tolerance){if(!a||!b)return false;const dot=Math.abs(a.direction.reduce((sum,x,i)=>sum+x*b.direction[i],0));if(dot<.999)return false;const delta=a.point.map((x,i)=>x-b.point[i]),along=delta.reduce((sum,x,i)=>sum+x*a.direction[i],0),perp=Math.hypot(...delta.map((x,i)=>x-along*a.direction[i]));return perp<tolerance}
  function closure(values,id){const seen=new Set(),pending=[id],surfaces=[];while(pending.length){const current=pending.pop();if(seen.has(current))continue;seen.add(current);const value=values.get(current);if(!value)continue;if(/^(?:CYLINDRICAL_SURFACE|TOROIDAL_SURFACE|PLANE)\b/.test(value))surfaces.push(value);for(const child of references(value))if(!seen.has(child))pending.push(child)}return surfaces}
  function parseSurface(value,values,scale){const ids=references(value),numbers=[...value.matchAll(/,\s*([-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?)\s*(?=[,)])/g)].map(x=>Number(x[1])*scale);return {type:value.startsWith('TOROIDAL')?'torus':value.startsWith('PLANE')?'plane':'cylinder',axis:axis(values,ids[0]),radius:numbers[0],minor:numbers[1]}}
  function squareProfile(surfaces,scale){
    const groups=new Map();
    for(const surface of surfaces){if(surface.type!=='plane'||!surface.axis)continue;const d=surface.axis.direction,first=d.find(x=>Math.abs(x)>.01),sign=Math.sign(first||1),normal=d.map(x=>x*sign),key=normal.map(x=>Math.round(x*100)/100).join(',');
      if(!groups.has(key))groups.set(key,{normal,positive:[],negative:[]});
      const position=surface.axis.point.reduce((sum,x,i)=>sum+x*normal[i],0)*scale;
      groups.get(key)[sign>0?'positive':'negative'].push(position);
    }
    const widths=[];
    for(const group of groups.values()){
      const positions=[group.positive,group.negative].map(list=>[...new Set(list.map(x=>Number(x.toFixed(4))))].sort((a,b)=>a-b));
      if(positions.some(list=>list.length<2))continue;
      const gaps=positions.map(list=>{const choices=[];for(let i=1;i<list.length;i++){const gap=list[i]-list[i-1];if(gap>.018&&gap<.2)choices.push(gap)}return choices.sort((a,b)=>a-b)[0]});
      if(gaps.some(gap=>!gap)||Math.abs(gaps[0]-gaps[1])>.006)continue;
      const all=positions.flat(),width=Math.max(...all)-Math.min(...all);
      if(width<.4||width>4)continue;
      widths.push({normal:group.normal,width,wall:(gaps[0]+gaps[1])/2});
    }
    for(let i=0;i<widths.length;i++)for(let j=i+1;j<widths.length;j++){
      const a=widths[i],b=widths[j],dot=Math.abs(a.normal.reduce((sum,x,k)=>sum+x*b.normal[k],0));
      if(dot<.1&&Math.abs(a.width-b.width)<.025&&Math.abs(a.wall-b.wall)<.006)return {od:(a.width+b.width)/2,wall:(a.wall+b.wall)/2};
    }
    return null;
  }
  function profile(surfaces,scale){
    const cylinders=surfaces.filter(s=>s.type==='cylinder'&&Number.isFinite(s.radius));
    const radii=[...new Set(cylinders.map(s=>Math.round(s.radius*10000)/10000))].sort((a,b)=>b-a);
    const candidates=[];
    for(const outer of radii)for(const inner of radii){const wall=outer-inner;if(outer<.2||wall<.018||wall>.2||wall/outer>.25)continue;
      const outside=cylinders.filter(s=>Math.abs(s.radius-outer)<.002),inside=cylinders.filter(s=>Math.abs(s.radius-inner)<.002);
      let pairs=0;for(const a of outside)if(inside.some(b=>sameLine(a.axis,b.axis,.012/scale)))pairs++;
      if(!pairs)continue;
      const larger=cylinders.filter(s=>s.radius>outer*1.3).length;
      if(larger>=outside.length&&larger>=2)continue;
      candidates.push({outer,inner,wall,pairs,axis:outside[0]?.axis,score:pairs*10+Math.min(outside.length,inside.length)+outer});
    }
    candidates.sort((a,b)=>b.score-a.score||b.outer-a.outer);
    return candidates[0]||null;
  }
  function bendEvidence(surfaces,pair,scale){
    const torus=surfaces.filter(s=>s.type==='torus'&&Number.isFinite(s.radius)&&Number.isFinite(s.minor));
    const matched=torus.filter(s=>Math.abs(s.minor-pair.outer)<.004||Math.abs(s.minor-pair.inner)<.004);
    const torusPair=matched.some(a=>Math.abs(a.minor-pair.outer)<.004&&matched.some(b=>Math.abs(b.minor-pair.inner)<.004&&Math.abs(a.radius-b.radius)<.01&&sameLine(a.axis,b.axis,.015/scale)));
    if(torusPair)return {bendFlag:'Bent',bendBasis:'Matched inside and outside toroidal bend surfaces'};
    const outside=surfaces.filter(s=>s.type==='cylinder'&&Math.abs(s.radius-pair.outer)<.004&&s.axis);
    for(let i=0;i<outside.length;i++)for(let j=i+1;j<outside.length;j++){
      const dot=Math.abs(outside[i].axis.direction.reduce((sum,x,k)=>sum+x*outside[j].axis.direction[k],0));
      if(dot<.985)return {bendFlag:'Review',bendBasis:'Tube-axis directions differ; inspect for a bend or coped end'};
    }
    if(matched.length)return {bendFlag:'Review',bendBasis:'Curved surface found; bend pairing needs review'};
    return {bendFlag:'Straight',bendBasis:'One tube-axis direction; no matched bend surface'};
  }
  function bendFeatures(values,solidId,pair,scale){
    const seen=new Set(),pending=[solidId],groups=new Map(),faces=[];
    while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);const value=values.get(id)||'';
      if(/^ADVANCED_FACE\b/.test(value)){
        const refs=references(value),surface=parseSurface(values.get(refs[1])||'',values,scale);
        if(surface.type==='torus'&&surface.axis&&Math.abs(surface.minor-pair.outer)<.004&&surface.radius>.1){
          const key=[...surface.axis.point.map(x=>x.toFixed(3)),...surface.axis.direction.map(x=>Math.abs(x).toFixed(3)),surface.radius.toFixed(3)].join('|');
          if(!groups.has(key))groups.set(key,{surface,vertices:[],edges:new Set()});
          const branch=new Set(),queue=[refs[0]];
          while(queue.length){const child=queue.pop();if(branch.has(child))continue;branch.add(child);const entry=values.get(child)||'';
            if(/^VERTEX_POINT\b/.test(entry)){const point=tuple(values.get(references(entry)[0]));if(point)groups.get(key).vertices.push(point);continue}
            if(/^EDGE_CURVE\b/.test(entry))groups.get(key).edges.add(child);
            for(const ref of references(entry))queue.push(ref);
          }
        }
        if(surface.type==='cylinder'&&surface.axis){const edges=new Set(),branch=new Set(),queue=[refs[0]];while(queue.length){const child=queue.pop();if(branch.has(child))continue;branch.add(child);const entry=values.get(child)||'';if(/^EDGE_CURVE\b/.test(entry)){edges.add(child);continue}for(const ref of references(entry))queue.push(ref)}faces.push({surface,edges})}
      }
      for(const ref of references(value))pending.push(ref);
    }
    const bends=[];
    for(const group of groups.values()){
      const {surface,vertices}=group;if(vertices.length<2)continue;
      const origin=surface.axis.point,normal=surface.axis.direction;
      const radial=vertices.map(point=>{const delta=point.map((x,i)=>x-origin[i]),along=delta.reduce((sum,x,i)=>sum+x*normal[i],0),v=delta.map((x,i)=>x-along*normal[i]),length=Math.hypot(...v);return length>.01?v.map(x=>x/length):null}).filter(Boolean);
      if(radial.length<2)continue;
      const u=radial[0],v=[normal[1]*u[2]-normal[2]*u[1],normal[2]*u[0]-normal[0]*u[2],normal[0]*u[1]-normal[1]*u[0]];
      const angles=radial.map(r=>(Math.atan2(r.reduce((s,x,i)=>s+x*v[i],0),r.reduce((s,x,i)=>s+x*u[i],0))+2*Math.PI)%(2*Math.PI)).sort((a,b)=>a-b);
      let gap=-1,gapIndex=0;for(let i=0;i<angles.length;i++){const next=i+1<angles.length?angles[i+1]:angles[0]+2*Math.PI,diff=next-angles[i];if(diff>gap){gap=diff;gapIndex=i}}
      const sweep=2*Math.PI-gap,faceAngle=sweep*180/Math.PI;if(faceAngle<2||faceAngle>180.5)continue;
      const adjacent=faces.filter(face=>Math.abs(face.surface.radius-pair.outer)<.004&&[...face.edges].some(edge=>group.edges.has(edge)));
      let angle=faceAngle,angleBasis='Toroidal face boundary vertices',bestDifference=8;
      for(let i=0;i<adjacent.length;i++)for(let j=i+1;j<adjacent.length;j++){
        const a=adjacent[i].surface.axis.direction,b=adjacent[j].surface.axis.direction,dot=Math.max(-1,Math.min(1,Math.abs(a.reduce((sum,x,k)=>sum+x*b[k],0))));
        const acute=Math.acos(dot)*180/Math.PI;
        for(const candidate of [acute,180-acute])if(candidate>2&&candidate<180&&Math.abs(candidate-faceAngle)<bestDifference){angle=candidate;bestDifference=Math.abs(candidate-faceAngle);angleBasis='Adjacent straight tube axes'}
      }
      const mid=(angles[(gapIndex+1)%angles.length]+sweep/2)%(2*Math.PI),center=origin.map((x,i)=>(x+surface.radius*(u[i]*Math.cos(mid)+v[i]*Math.sin(mid)))*scale);
      bends.push({angle:Number(angle.toFixed(1)),clr:Number((surface.radius*scale).toFixed(3)),center:center.map(x=>Number(x.toFixed(4))),basis:angleBasis});
    }
    return bends.sort((a,b)=>a.center[0]-b.center[0]||a.center[1]-b.center[1]||a.center[2]-b.center[2]);
  }
  function detectStepSpecs(source,expectedCount,meshes){
    const values=entitiesOf(source),scale=unitScale(values);
    if(scale==null)throw Error('STEP length units could not be identified. Tube dimensions were left unfilled.');
    const representation=[...values.values()].find(value=>/^ADVANCED_BREP_SHAPE_REPRESENTATION\b/.test(value))||'';
    const bodyList=representation.match(/ADVANCED_BREP_SHAPE_REPRESENTATION\s*\(\s*'(?:''|[^'])*'\s*,\s*\(([^)]*)\)/)?.[1]||'';
    const solids=references(bodyList).filter(id=>/^MANIFOLD_SOLID_BREP\b/.test(values.get(id)||''));
    if(expectedCount!=null&&solids.length!==expectedCount)throw Error('STEP body count differs from CAD mesh count.');
    return solids.map((id,index)=>{const surfaces=closure(values,id).map(v=>parseSurface(v,values,scale));let pair=profile(surfaces,scale),section=null,sectionBasis=false;
      if(!pair){const square=squareProfile(surfaces,scale);if(square)return {type:'Square',od:Number(square.od.toFixed(4)),wall:Number(square.wall.toFixed(4)),bendFlag:'Straight',specBasis:'Paired parallel square-tube wall planes',bendBasis:'One square-section direction; no bend surface'};
        section=typeof MeshSection!=='undefined'&&meshes?.[index]?MeshSection.inspect(meshes[index]):null;
        if(section?.circular&&section.radialSpread<.08){const radii=[...new Set(surfaces.filter(s=>s.type==='cylinder'&&Number.isFinite(s.radius)).map(s=>Number(s.radius.toFixed(5))))];let best=null;for(const outer of radii)for(const inner of radii){const wall=outer-inner,error=Math.abs(outer-section.outerDiameter/2)+Math.abs(wall-section.wall);if(wall>.018&&wall<.15&&Math.abs(outer-section.outerDiameter/2)<.04&&Math.abs(wall-section.wall)<.025&&(!best||error<best.error))best={outer,inner,wall,error}}if(best){pair=best;sectionBasis=true}}
        if(!pair)return {type:'Unspecified',od:0,wall:0,bendFlag:'Review',section,specBasis:section?'Mid-axis section could not establish a reliable tube wall':'No reliable tube surface pair',bendBasis:'Bend status needs review'};
      }
      const bend=bendEvidence(surfaces,pair,scale);
      const planeTilts=bend.bendFlag==='Straight'&&pair.axis?surfaces.filter(s=>s.type==='plane'&&s.axis).map(s=>Math.acos(Math.min(1,Math.abs(s.axis.direction.reduce((sum,x,i)=>sum+x*pair.axis.direction[i],0))))*180/Math.PI).filter(Number.isFinite):[];
      const bendRadii=[...new Set(surfaces.filter(s=>s.type==='torus'&&Math.abs(s.minor-pair.outer)<.004&&Number.isFinite(s.radius)).map(s=>Number(s.radius.toFixed(3))))].sort((a,b)=>a-b);
      const bends=bend.bendFlag==='Bent'?bendFeatures(values,id,pair,scale):[];
      return {type:'Round',od:Number((pair.outer*2).toFixed(4)),wall:Number(pair.wall.toFixed(4)),bendRadii,bends,section,planeTilts:planeTilts.map(x=>Number(x.toFixed(1))),specBasis:sectionBasis?'Mid-axis section normal to tube centerline, cross-checked with STEP cylinder radii':'Concentric inside/outside cylindrical surfaces',...bend};
    });
  }
  root.StepSpecs={detectStepSpecs};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.StepSpecs;
})(typeof self!=='undefined'?self:globalThis);
