/* A mirrored pair has no intrinsic left/right item number in a STEP file.
   Require a human decision for every such pair before numbered exports. */
(() => {
  const style=document.createElement('style');
  style.textContent='.number-audit{margin:0 0 46px;padding:20px;border:2px solid #ad612c;background:#fffaf4}.number-audit[hidden]{display:none}.number-audit h2{margin:0 0 8px}.number-audit p{font-size:14px;line-height:1.5;color:#42586b}.number-audit strong{color:#7a3e20}.number-audit-table{max-height:420px;overflow:auto;border:1px solid #cfdae2;background:#fff}.number-audit table{width:100%;border-collapse:collapse;font-size:13px}.number-audit th,.number-audit td{padding:8px 10px;border-bottom:1px solid #e0e7ec;text-align:left}.number-audit th{position:sticky;top:0;background:#eef3f6}.number-audit button{margin:2px 5px 2px 0;padding:6px 9px;font-size:12px;cursor:pointer}.number-audit .pending{font-weight:700;color:#a34d21}.number-audit .confirmed{font-weight:700;color:#267148}@media(max-width:760px){.number-audit-table{overflow:auto}.number-audit table{min-width:800px}}';
  document.head.append(style);
  const section=document.createElement('section');
  section.className='number-audit';section.id='numberAudit';section.hidden=true;
  section.innerHTML='<h2>Verify mirrored tube numbers</h2><p>A STEP solid has geometry and coordinates, but no trusted left/right item label. Compare each paired tube with your order or physical parts. Confirm the labels shown or swap the pair. Numbered downloads stay locked until every pair is reviewed.</p><p id="numberAuditStatus" role="status"></p><div id="numberAuditTable" class="number-audit-table"></div>';
  document.getElementById('stepResults').after(section);
  let pairs=[],confirmed=new Set();
  const key=pair=>`${pair.a}-${pair.b}`;
  const yCenter=body=>(body.bounds.lo[1]+body.bounds.hi[1])/2;
  const sourceRow=n=>state.rows.find(row=>row.cadBody===n&&row.cadFile===cadFilename);
  const exportIds=['stepPackage','groupedStepDownload','stepDownload','stepPrint','assemblyDownload','assemblyPrint','manufacturingExport','bomExport','cutExport','sheetsExport','downloadDrawing','printDrawing','saveProject'];
  function setExportButtons(){
    const ready=confirmed.size===pairs.length&&NumberingCore.validateNumbers(cadBodies,bodyBalloonNumber);
    for(const id of exportIds){const button=document.getElementById(id);if(button)button.disabled=!ready&&cadBodies.length>0}
    return ready;
  }
  function renderAudit(){
    section.hidden=!cadBodies.length;
    if(!cadBodies.length)return;
    const pending=pairs.length-confirmed.size;
    document.getElementById('numberAuditStatus').innerHTML=pending?`<strong>${pending} of ${pairs.length} mirrored pairs need review.</strong> Numbered exports are locked.`:`<strong>All ${pairs.length} mirrored pairs reviewed.</strong> Numbered exports are available.`;
    document.getElementById('numberAuditTable').innerHTML='<table><thead><tr><th>Paired source bodies</th><th>Current item labels</th><th>Y centers (in)</th><th>Status</th><th>Decision</th></tr></thead><tbody>'+pairs.map(pair=>{
      const a=cadBodies[pair.a-1],b=cadBodies[pair.b-1],done=confirmed.has(key(pair));
      return `<tr><td>${pair.a} · ${safe(a.name)}<br>${pair.b} · ${safe(b.name)}</td><td>Body ${pair.a} → <b>${bodyBalloonNumber(a)}</b><br>Body ${pair.b} → <b>${bodyBalloonNumber(b)}</b></td><td>${fmt(yCenter(a),3)}<br>${fmt(yCenter(b),3)}</td><td class="${done?'confirmed':'pending'}">${done?'Reviewed':'Needs review'}</td><td><button type="button" data-show="${pair.a}">Show ${pair.a}</button><button type="button" data-show="${pair.b}">Show ${pair.b}</button><br><button type="button" data-pair="${key(pair)}" data-choice="keep">Confirm as shown</button><button type="button" data-pair="${key(pair)}" data-choice="swap">Swap these labels</button></td></tr>`;
    }).join('')+'</tbody></table>';
    setExportButtons();
  }
  function setPair(pair,swap){
    if(swap){
      const a=cadBodies[pair.a-1],b=cadBodies[pair.b-1],oldA=bodyBalloonNumber(a),oldB=bodyBalloonNumber(b);
      cadBalloonOverrides.set(pair.a,oldB);cadBalloonOverrides.set(pair.b,oldA);
      const rowA=sourceRow(pair.a),rowB=sourceRow(pair.b);
      if(rowA)rowA.item=oldB;
      if(rowB)rowB.item=oldA;
      if(rowA||rowB){selected=selected===oldA?oldB:selected===oldB?oldA:selected;persist()}
    }
    confirmed.add(key(pair));cadPackage=null;render();renderCadBodies();if(typeof renderAssembly==='function')renderAssembly();renderAudit();
  }
  section.addEventListener('click',event=>{
    const show=event.target.closest('button[data-show]');
    if(show){cadSelected=cadBodies.findIndex(body=>body.number===Number(show.dataset.show));renderCadBodies();renderAssembly();document.getElementById('assemblySection')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    const button=event.target.closest('button[data-pair]');if(!button)return;
    const pair=pairs.find(item=>key(item)===button.dataset.pair);if(pair)setPair(pair,button.dataset.choice==='swap');
  });
  window.initializeNumberingAudit=()=>{
    pairs=NumberingCore.mirroredPairs(cadBodies);confirmed=new Set();cadBalloonOverrides.clear();
    if(isFrameSendOutPair()){
      const pair=pairs.find(item=>item.a===22&&item.b===23);
      if(!pair)throw Error('The known 22/23 mirrored pair was not detected. Numbered export is blocked.');
      cadBalloonOverrides.set(22,23);cadBalloonOverrides.set(23,22);confirmed.add(key(pair));
    }
    renderAudit();
  };
  window.clearNumberingAudit=()=>{pairs=[];confirmed.clear();section.hidden=true};
  window.ensureNumberingAudit=()=>{
    if(!cadBodies.length)return true;
    if(setExportButtons())return true;
    const pending=pairs.length-confirmed.size;
    stepStatus(pending?`Review ${pending} mirrored tube pairs before exporting numbered files.`:'Item numbers are duplicated or invalid. Correct the tube set before export.',true);
    section.scrollIntoView({behavior:'smooth',block:'start'});
    return false;
  };
  window.numberingReviewRows=()=>[['source body A','item A','Y center A in','source body B','item B','Y center B in','reviewed'],...pairs.map(pair=>[pair.a,bodyBalloonNumber(cadBodies[pair.a-1]),fmt(yCenter(cadBodies[pair.a-1]),5),pair.b,bodyBalloonNumber(cadBodies[pair.b-1]),fmt(yCenter(cadBodies[pair.b-1]),5),confirmed.has(key(pair))?'yes':'no'])];
  for(const id of exportIds){
    const button=document.getElementById(id);if(!button||typeof button.onclick!=='function')continue;
    const action=button.onclick;button.onclick=function(event){if(!window.ensureNumberingAudit())return;return action.call(this,event)};
  }
})();
