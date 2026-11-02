let cadBodies=[];let cadMeshes=[];let cadSelected=0;let cadFilename='';let cadParts=[];let cadSpecs=[];let cadPackage=null;let cadPackageHasLaserReview=false;let cadSourceFile=null;
const stepStatus=(message,error=false)=>{const el=$('stepStatus');el.textContent=message;el.classList.toggle('error',error)};
function collectBodies(root,meshes,parts=[]){const found=[];function visit(node,path){const label=String(node?.name||'').trim();const here=label?[...path,label]:path;if(node?.meshes?.length){const ids=node.meshes.filter(i=>meshes[i]?.attributes?.position?.array?.length&&meshes[i]?.index?.array?.length);for(const id of ids)found.push({name:parts[id]?.solidName||meshes[id]?.name||`${here.join(' / ')||'Body'} ${id+1}`,ids:[id]})}for(const child of node?.children||[])visit(child,here)}visit(root,[]);if(!found.length)meshes.forEach((m,i)=>{if(m?.attributes?.position?.array?.length&&m?.index?.array?.length)found.push({name:parts[i]?.solidName||m.name||`Body ${i+1}`,ids:[i]})});return found.map((b,i)=>({...b,number:i+1,bounds:bodyBounds(b,meshes)}))}
function bodyBounds(body,meshes){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let vertices=0,triangles=0;for(const id of body.ids){const m=meshes[id],a=m.attributes.position.array;vertices+=a.length/3;triangles+=m.index.array.length/3;for(let i=0;i<a.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],a[i+k]);hi[k]=Math.max(hi[k],a[i+k])}}return {lo,hi,size:hi.map((x,i)=>x-lo[i]),vertices,triangles}}
async function readStep(file){
  if(!file)return;
  if(file.size>200*1024*1024)return stepStatus('This STEP is over 200 MB. Export a smaller body set or split the model.',true);
  cadBodies=[];cadMeshes=[];cadParts=[];cadSpecs=[];cadPackage=null;window.currentLaserAuditRows=null;cadFilename=file.name;cadSourceFile=file;
  $('stepName').textContent=file.name;$('stepResults').hidden=true;
  stepStatus(`Reading ${file.name} and separating solid bodies…`);
  let worker;
  try{
    const buffer=await file.arrayBuffer();worker=new Worker('step-worker.js?v=8');
    const answer=await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(new Error(e.message||'CAD importer failed'));worker.postMessage(buffer,[buffer])});
    if(!answer.ok)throw Error(answer.error);
    const result=answer.result;
    if(!result.success||!result.meshes?.length)throw Error('No usable solid bodies were returned. Re-export the solid bodies from SolidWorks and try again.');
    if(answer.splitError)throw Error(`The solid STEP files could not be isolated: ${answer.splitError}`);
    cadMeshes=result.meshes;cadParts=answer.parts||[];cadSpecs=answer.specs||[];
    cadBodies=collectBodies(result.root,cadMeshes,cadParts);
    if(!cadBodies.length||cadParts.length!==cadBodies.length)throw Error('Body and STEP file counts differ. The export needs review.');
    cadSelected=0;$('stepCount').textContent=`${cadBodies.length} ${cadBodies.length===1?'body':'bodies'}`;
    $('stepResults').hidden=false;renderCadBodies();
    stepStatus(`${cadBodies.length} bodies found. Generating individual STEP files and drawing sheets…`);
    await buildStepPackage();
    if(typeof window.loadLaserAudit==='function')await window.loadLaserAudit();
    if(typeof window.loadBevelReviewSummary==='function')await window.loadBevelReviewSummary();
    stepStatus(`${cadBodies.length} bodies are ready. ${cadSpecs.filter(s=>s.type!=='Unspecified').length} tube profiles detected${answer.specError?` (${answer.specError})`:''}. Download all bodies + drawings ZIP, or sort STEP files by profile, size and wall.`);
    $('stepResults').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){cadBodies=[];cadMeshes=[];cadParts=[];cadSpecs=[];cadPackage=null;$('stepResults').hidden=true;stepStatus(`Could not generate this frame package: ${error.message}`,true)}
  finally{worker?.terminate()}
}
async function buildStepPackage(includeLaserReview=false){
  if(typeof JSZip==='undefined')throw Error('ZIP packaging library did not load.');
  const zip=new JSZip(),steps=zip.folder('individual-step'),drawings=zip.folder('drawings-svg');
  for(let i=0;i<cadBodies.length;i++){
    const part=cadParts[i],body=cadBodies[i],base=tubeFileBase(body);
    steps.file(`${base}.step`,part.bytes);
    drawings.file(`${base}.svg`,stepSvg(body));
    if(i%5===0){stepStatus(`Generating drawings ${i+1} / ${cadBodies.length}…`);await new Promise(requestAnimationFrame)}
  }
  if(typeof assemblySvg==='function')zip.file('assembly-bubbles.svg',assemblySvg());
  if(includeLaserReview){
    if(typeof window.addLaserReviewToZip!=='function')throw Error('Laser review module did not load.');
    window.lastLaserReviewSummary=await window.addLaserReviewToZip(zip);
  }
  if(cadSpecs.length)zip.file('detected-tube-specs.csv',csv([['balloon number','STEP body','export base name','profile','outside size in','wall in','bend flag','bend angles degrees','bend CLRs in','profile evidence','bend evidence'],...cadBodies.map((body,i)=>[bodyBalloonNumber(body),body.number,tubeFileBase(body),cadSpecs[i]?.type||'Unspecified',cadSpecs[i]?.od||'',cadSpecs[i]?.wall||'',cadSpecs[i]?.bendFlag||'Review',(cadSpecs[i]?.bends||[]).map(b=>b.angle).join('; '),(cadSpecs[i]?.bends||[]).map(b=>b.clr).join('; '),cadSpecs[i]?.specBasis||'',cadSpecs[i]?.bendBasis||''])]));
  zip.file('README.txt',`${cadFilename}\n${cadBodies.length} individual STEP solids, three-view SVG drawings, and a numbered isometric assembly SVG.\n${includeLaserReview?'The folder "Tube laser reviewed parts" contains a corresponding numbered STEP for each body. Read tube-laser-review.csv: reviewed entries have two planar 45-degree ends; NEEDS-CAD-REVIEW entries retain their source geometry. All bevels are additive. Add copes and verify assembly fit before fabrication.\n':''}\nPart filenames begin with the balloon number and include the detected tube type, outside size, and wall. Each original STEP file contains one analytic solid with source geometry preserved. The largest overall axis is the baseline on each body sheet. Bend numbers B1, B2, etc. identify geometric bends on the body drawing; angles are inferred from STEP toroidal face boundaries and adjacent tube axes. All bend angles and centerline radii require CAD review before fabrication.\n\nReference: VR3 Solid Modeling guide (2023-06-27), https://vr3.ca/documents/SolidModeling.20230627.pdf. Keep balloon, BOM, and part numbers consistent.\n`);
  stepStatus('Compressing the STEP and drawing package…');
  cadPackage=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
  cadPackageHasLaserReview=includeLaserReview;
}
function downloadStepPackage(){if(!cadPackage)return;const a=document.createElement('a');a.href=URL.createObjectURL(cadPackage);a.download=`${cadFilename.replace(/\.(step|stp)$/i,'')}-${cadPackageHasLaserReview?'tube-laser-package':'individual-bodies-and-drawings'}.zip`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000)}
async function downloadGroupedStepParts(){
  if(!cadBodies.length||cadParts.length!==cadBodies.length)return stepStatus('Load a multi-body STEP first.',true);
  const button=$('groupedStepDownload');button.disabled=true;
  try{
    const zip=new JSZip(),rows=[];let identified=0;
    for(let i=0;i<cadBodies.length;i++){
      const body=cadBodies[i],spec=resolvedTubeSpec(body),balloon=bodyBalloonNumber(body),base=tubeFileBase(body);
      const hasSpec=(spec.type==='Round'||spec.type==='Square')&&Number.isFinite(spec.od)&&spec.od>0&&Number.isFinite(spec.wall)&&spec.wall>0;
      const folder=hasSpec?`${spec.type}/OD_${fmt(spec.od,3)}_in-Wall_${fmt(spec.wall,3)}_in`:`Needs-Spec-Review/${spec.type==='Round'||spec.type==='Square'?`${spec.type}-size-or-wall-missing`:'Unspecified-profile'}`;
      if(hasSpec)identified++;
      zip.folder(folder).file(`${base}_BODY-${String(body.number).padStart(3,'0')}.step`,cadParts[i].bytes);
      rows.push([balloon,body.number,body.name,spec.type||'Unspecified',spec.od||'',spec.wall||'',folder]);
    }
    zip.file('tube-spec-folder-index.csv',csv([['balloon number','STEP body number','source body name','tube profile','outside size in','wall thickness in','folder'],...rows]));
    zip.file('README.txt',`${cadFilename}\n\n${cadBodies.length} individual STEP solids sorted into folders by detected tube profile, outside size, and wall thickness. Units are inches. All files retain their original STEP body geometry.\n\n${identified} bodies have a detected profile, outside size, and wall thickness. ${cadBodies.length-identified} bodies are included in Needs-Spec-Review because one or more required tube specifications could not be determined. No body was omitted. Review tube-spec-folder-index.csv and confirm every classification in CAD before fabrication.\n`);
    button.textContent='Preparing grouped STEP files…';
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${cadFilename.replace(/\.(step|stp)$/i,'')}-parts-by-tube-size-and-wall.zip`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),60000);
    stepStatus(`Downloaded ${cadBodies.length} individual STEP files sorted by tube profile, outside size, and wall. ${identified} classified; ${cadBodies.length-identified} retained in Needs-Spec-Review.`);
  }catch(error){stepStatus(`Grouped STEP export failed: ${error.message}`,true)}
  finally{button.disabled=false;button.textContent='Download STEP parts grouped by size + wall ↓'}
}
function resolvedTubeSpec(body){const row=associatedItem(body),detected=cadSpecs[body.number-1]||{};return{type:row?.type&&row.type!=='Unspecified'?row.type:detected.type||row?.type||'Unspecified',od:Number(row?.od)||Number(detected.od)||0,wall:Number(row?.wall)||Number(detected.wall)||0}}
function bodyBalloonNumber(body){return associatedItem(body)?.item??body.number}
function tubeFileBase(body){const spec=cadSpecs[body.number-1]||{},row=associatedItem(body),type=row?.type||spec.type||'Unspecified',od=row?.od||spec.od,wall=row?.wall||spec.wall,number=String(bodyBalloonNumber(body)).padStart(3,'0');return `${number}_${type}_${od&&wall?`${fmt(od,3)}x${fmt(wall,3)}`:'specs-pending'}`.replace(/[^A-Za-z0-9_.-]/g,'_')}
function renderCadBodies(){const list=$('stepList');list.replaceChildren();cadBodies.forEach((b,i)=>{const button=document.createElement('button');button.className=i===cadSelected?'active':'';const title=document.createElement('strong'),sub=document.createElement('small');title.textContent=b.name;sub.textContent=`${b.bounds.triangles.toLocaleString()} triangles · ${b.bounds.size.map(v=>fmt(v,2)).join(' × ')} in`;button.append(title,sub);button.onclick=()=>{cadSelected=i;renderCadBodies()};list.append(button)});$('stepPreview').innerHTML=stepSvg(cadBodies[cadSelected])}
function projectionImage(body,axes,width=520,height=220){const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);const lo=body.bounds.lo,hi=body.bounds.hi;const sx=Math.max(hi[axes[0]]-lo[axes[0]],1e-6),sy=Math.max(hi[axes[1]]-lo[axes[1]],1e-6),scale=Math.min((width-44)/sx,(height-44)/sy);const dw=sx*scale,dh=sy*scale,offX=(width-dw)/2,offY=(height-dh)/2;ctx.fillStyle='#29465d';for(const id of body.ids){const mesh=cadMeshes[id],a=mesh.attributes.position.array,idx=mesh.index.array;for(let i=0;i<idx.length;i+=3){ctx.beginPath();for(let j=0;j<3;j++){const n=idx[i+j]*3,x=offX+(a[n+axes[0]]-lo[axes[0]])*scale,y=height-offY-(a[n+axes[1]]-lo[axes[1]])*scale;if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.closePath();ctx.fill()}}return canvas.toDataURL('image/png')}
function viewSvg(body,axes,x,y,w,h,title){const img=projectionImage(body,axes,w-24,h-54),dims=body.bounds.size;return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fbfcfd" stroke="#cdd8e1"/><text x="${x+14}" y="${y+22}" class="viewname">${title}</text><image href="${img}" x="${x+12}" y="${y+31}" width="${w-24}" height="${h-54}" preserveAspectRatio="xMidYMid meet"/><line x1="${x+30}" y1="${y+h-14}" x2="${x+w-30}" y2="${y+h-14}" stroke="#7c93a7"/><text x="${x+w/2}" y="${y+h-17}" text-anchor="middle" class="dim">${fmt(dims[axes[0]],3)}&quot; ${'XYZ'[axes[0]]}</text><text x="${x+w-16}" y="${y+22}" text-anchor="end" class="dim">${fmt(dims[axes[1]],3)}&quot; ${'XYZ'[axes[1]]}</text></g>`}
function associatedItem(body){const m=body.name.match(/^(?:item[- ]?)?(\d{1,4})$/i);return m?state.rows.find(r=>r.item===Number(m[1])):null}
/* VR3-style bend IDs tie a centerline angle and CLR to a location on the part. */
function stepSvg(body){
  if(!body)return '';
  const row=associatedItem(body),spec=cadSpecs[body.number-1]||{},bends=spec.bends||[],axes=[0,1,2].sort((a,b)=>body.bounds.size[b]-body.bounds.size[a]),primary=[axes[0],axes[1]],secondary=[axes[0],axes[2]],end=[axes[1],axes[2]],name='XYZ',lo=body.bounds.lo,span=body.bounds.size;
  const imageWidth=1126,imageHeight=374,sx=Math.max(span[primary[0]],1e-6),sy=Math.max(span[primary[1]],1e-6),scale=Math.min((imageWidth-44)/sx,(imageHeight-44)/sy),offX=(imageWidth-sx*scale)/2,offY=(imageHeight-sy*scale)/2;
  const marks=bends.map((bend,i)=>{const x=37+offX+(bend.center[primary[0]]-lo[primary[0]])*scale,y=122+imageHeight-offY-(bend.center[primary[1]]-lo[primary[1]])*scale;if(x<42||x>1158||y<128||y>492)return '';return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="#fff7e8" stroke="#bc6831" stroke-width="2"/><text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="middle" class="bendmark">B${i+1}</text></g>`}).join('');
  const bendLines=bends.length?bends.slice(0,5).map((bend,i)=>`<text x="880" y="${624+i*15}" class="meta">B${i+1} ${fmt(bend.angle,1)}° bend · CLR ${fmt(bend.clr,3)}&quot;</text>`).join(''):`<text x="880" y="624" class="meta">${spec.bendFlag==='Bent'?'Bend angle needs CAD review':`Bend: ${safe(spec.bendFlag||'review')}`}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="Tube ${bodyBalloonNumber(body)} geometry and bend drawing"><style>.title{font:700 26px Arial;fill:#152c44}.subtitle{font:13px Arial;fill:#70849a}.viewname{font:700 14px Arial;fill:#345f7e}.dim{font:700 12px Arial;fill:#4a6881}.meta{font:12px Arial;fill:#354f67}.bendmark{font:700 11px Arial;fill:#9a4f22}</style><rect width="1200" height="800" fill="white"/><rect x="12" y="12" width="1176" height="776" fill="none" stroke="#aebfcd"/><text x="34" y="49" class="title">${safe(tubeFileBase(body).replaceAll('_',' '))}</text><text x="34" y="70" class="subtitle">VR3 reference layout · balloon ${bodyBalloonNumber(body)} · longest axis ${name[axes[0]]} is baseline · inches</text>${viewSvg(body,primary,25,91,1150,428,`PRIMARY PROJECTION · ${name[primary[0]]} / ${name[primary[1]]}`)}${marks}${viewSvg(body,secondary,25,537,550,165,`SECONDARY · ${name[secondary[0]]} / ${name[secondary[1]]}`)}${viewSvg(body,end,590,537,260,165,`END · ${name[end[0]]} / ${name[end[1]]}`)}<rect x="864" y="537" width="311" height="165" fill="#f6f9fb" stroke="#cdd8e1"/><text x="880" y="560" class="viewname">BEND &amp; LENGTH CALLOUTS</text><text x="880" y="582" class="meta">Overall ${name[axes[0]]}: ${fmt(span[axes[0]],3)}&quot; envelope</text><text x="880" y="603" class="meta">${row?.length?`Reference cut: ${fmt(row.length,3)}&quot;`:'Reference cut: not supplied'}</text>${bendLines}<line x1="25" x2="1175" y1="726" y2="726" stroke="#cdd8e1"/><text x="34" y="751" class="subtitle">Bend angles and CLRs are geometry-derived centerline estimates. Verify tangent points, end trims, and tooling in CAD.</text><text x="1160" y="751" text-anchor="end" class="subtitle">BODY ${body.number}/${cadBodies.length}</text></svg>`;
};
function printStepSheets(){if(!cadBodies.length)return;const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to print the drawing pack.');w.document.write(`<!doctype html><html><head><title>STEP body drawings</title><style>@page{size:letter landscape;margin:.25in}body{margin:0;font-family:Arial}.sheet{break-after:page}.sheet:last-child{break-after:auto}.sheet svg{width:100%;height:auto;max-height:7.9in}</style></head><body>${cadBodies.map(b=>`<section class="sheet">${stepSvg(b)}</section>`).join('')}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);w.document.close()}
$('stepFile').onchange=e=>readStep(e.target.files[0]);
$('stepPackage').onclick=downloadStepPackage;
$('groupedStepDownload').onclick=downloadGroupedStepParts;
$('clearTubes').onclick=clearImportedTubes;
$('stepDownload').onclick=()=>{const b=cadBodies[cadSelected];if(b)download(`${tubeFileBase(b)}.svg`,stepSvg(b),'image/svg+xml')};
$('stepPrint').onclick=printStepSheets;
function clearImportedTubes(){
  const sourceName=cadFilename,removed=cadBodies.length,linked=state.rows.filter(row=>row.cadFile===sourceName).length;
  state.rows=state.rows.filter(row=>row.cadFile!==sourceName);
  if(sourceName&&state.source.includes(`STEP bodies linked from ${sourceName}`))state.source='';
  cadBodies=[];cadMeshes=[];cadParts=[];cadSpecs=[];cadSelected=0;cadFilename='';cadSourceFile=null;cadPackage=null;cadPackageHasLaserReview=false;
  window.currentLaserAuditRows=null;window.lastLaserReviewSummary=null;
  $('stepFile').value='';$('stepName').textContent='One upload makes individual STEP files and drawing sheets';$('stepResults').hidden=true;
  const assembly=$('assemblySection');if(assembly){assembly.hidden=true;$('assemblyView')?.replaceChildren()}
  selected=state.rows.some(row=>row.item===selected)?selected:(state.rows[0]?.item??null);persist();render();
  stepStatus(`Cleared ${removed} imported STEP ${removed===1?'tube':'tubes'}${linked?` and removed ${linked} linked tube-set ${linked===1?'row':'rows'}`:''}. Other tube-set and order data were kept.`);
}
