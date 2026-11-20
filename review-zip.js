/* Read-only inspection of a previously exported tube package. Everything stays in this browser. */
(() => {
  const style = document.createElement('style');
  style.textContent = `.zip-review{margin:0 0 46px}.zip-review[hidden]{display:none}.zip-review-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:15px 0}.zip-review-grid div{padding:15px;border:1px solid var(--line);background:#fff}.zip-review-grid strong{display:block;font-size:24px;color:#173d56}.zip-review-grid span{font-size:12px;color:var(--muted)}.zip-review-note{font-size:14px;line-height:1.5;color:#425c70}.zip-review-table{max-height:380px;overflow:auto;border:1px solid var(--line);background:#fff}.zip-review-table table{width:100%;border-collapse:collapse;font-size:13px}.zip-review-table th,.zip-review-table td{text-align:left;border-bottom:1px solid #e1e8ed;padding:8px 10px}.zip-review-table th{position:sticky;top:0;background:#eaf1f5}.zip-review-image{display:block;width:100%;max-height:850px;object-fit:contain;margin:15px auto;background:#fff;border:1px solid var(--line)}.zip-review-image[hidden]{display:none}.zip-review .missing{color:#aa482d;font-weight:700}.zip-review .present{color:#277352;font-weight:700}@media(max-width:700px){.zip-review-grid{grid-template-columns:repeat(2,1fr)}}`;
  document.head.append(style);
  const section = document.createElement('section');
  section.className = 'zip-review';
  section.hidden = true;
  section.innerHTML = '<div class="section-head"><div><span class="kicker">SENT PACKAGE / AUDIT</span><h2>What was in the ZIP</h2></div><button id="zipReviewClear" class="secondary">Close review</button></div><p id="zipReviewStatus" class="zip-review-note"></p><div id="zipReviewCounts" class="zip-review-grid"></div><div id="zipReviewTable" class="zip-review-table"></div><img id="zipReviewImage" class="zip-review-image" alt="Assembly drawing contained in the selected ZIP" hidden><p class="zip-review-note">This is the drawing as sent. To generate a corrected colored assembly, import the original multi-body STEP above and download a new assembly SVG. Compare the balloon numbers and specifications with the manufacturer order before releasing parts.</p>';
  document.querySelector('.workflow').after(section);
  const input=document.getElementById('sentZipFile');
  let imageUrl=null;
  const clear=()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;section.hidden=true;input.value=''};
  document.getElementById('zipReviewClear').onclick=clear;
  const escape=string=>String(string??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numberFrom=path=>{const match=path.split('/').pop().match(/^(\d{1,4})[_ -]/);return match?Number(match[1]):null};
  const getField=(row,heads,...names)=>{const i=names.map(name=>heads.indexOf(name)).find(i=>i>=0);return i===undefined?'':row[i]||''};
  input.onchange=async()=>{
    const file=input.files?.[0];if(!file)return;
    clear();section.hidden=false;
    const status=document.getElementById('zipReviewStatus'),counts=document.getElementById('zipReviewCounts'),table=document.getElementById('zipReviewTable'),image=document.getElementById('zipReviewImage');
    status.textContent=`Reading ${file.name} locally…`;counts.replaceChildren();table.replaceChildren();image.hidden=true;
    try{
      if(file.size>500*1024*1024)throw Error('ZIP is over 500 MB. Split it into smaller packages.');
      const zip=await JSZip.loadAsync(file,{checkCRC32:true});
      const files=Object.keys(zip.files).filter(path=>!zip.files[path].dir&&!path.split('/').some(part=>part==='..'||part==='__MACOSX'));
      const original=files.filter(path=>/\.(?:step|stp)$/i.test(path)&&!/(tube laser reviewed parts|reviewed|dfm)/i.test(path));
      const reviewed=files.filter(path=>/\.(?:step|stp)$/i.test(path)&&/(tube laser reviewed parts|reviewed|dfm)/i.test(path));
      const drawings=files.filter(path=>/\.svg$/i.test(path)&&!/(assembly|bubble)/i.test(path));
      const drawing=files.find(path=>/(assembly|bubble).*\.svg$/i.test(path));
      const index=files.find(path=>/tube-spec-folder-index\.csv$/i.test(path))||files.find(path=>/detected-tube-specs\.csv$/i.test(path));
      const records=new Map();
      for(const path of original){const number=numberFrom(path);if(number!==null){const row=records.get(number)||{number,original:[],reviewed:[],drawings:[]};row.original.push(path);records.set(number,row)}}
      for(const path of reviewed){const number=numberFrom(path);if(number!==null){const row=records.get(number)||{number,original:[],reviewed:[],drawings:[]};row.reviewed.push(path);records.set(number,row)}}
      for(const path of drawings){const number=numberFrom(path);if(number!==null){const row=records.get(number)||{number,original:[],reviewed:[],drawings:[]};row.drawings.push(path);records.set(number,row)}}
      let indexed=0,mismatches=0;
      if(index){
        const lines=parseCSV(await zip.files[index].async('string'));
        const heads=(lines.shift()||[]).map(x=>x.trim().toLowerCase());
        for(const values of lines){
          const number=Number(getField(values,heads,'balloon number'));
          if(!Number.isInteger(number)||number<1)continue;
          const row=records.get(number)||{number,original:[],reviewed:[],drawings:[]};
          row.profile=getField(values,heads,'tube profile','profile');row.size=getField(values,heads,'outside size in');row.wall=getField(values,heads,'wall thickness in','wall in');
          if(row.original.length&&row.profile&&row.size&&row.wall){const label=row.original[0].toLowerCase();if(!label.includes(row.profile.toLowerCase())||!label.includes(`${row.size}x${row.wall}`.toLowerCase()))mismatches++}
          records.set(number,row);indexed++;
        }
      }
      const sorted=[...records.values()].sort((a,b)=>a.number-b.number);
      const missingOriginal=sorted.filter(row=>!row.original.length).length;
      const duplicateOriginal=sorted.filter(row=>row.original.length>1).length;
      const cards=[['Numbered parts',sorted.length],['Numbered original STEP',sorted.reduce((sum,row)=>sum+row.original.length,0)],['Reviewed STEP files',reviewed.length],['Missing originals',missingOriginal]];
      counts.innerHTML=cards.map(([label,value])=>`<div><strong>${value}</strong><span>${label}</span></div>`).join('');
      status.textContent=`${file.name}: ${files.length} files. ${indexed?`${indexed} tube-spec index rows. `:'No tube-spec index found. '}${mismatches?`${mismatches} filename/spec mismatches. `:''}${duplicateOriginal?`${duplicateOriginal} duplicated original numbers. `:''}${drawing?'The original assembly SVG is shown below.':'No assembly SVG found.'}`;
      table.innerHTML='<table><thead><tr><th>Balloon</th><th>Tube / wall (in)</th><th>Original STEP</th><th>Reviewed STEP</th><th>Sheet SVG</th></tr></thead><tbody>'+sorted.map(row=>`<tr><td><b>${row.number}</b></td><td>${escape([row.profile,row.size&&`OD ${row.size}`,row.wall&&`wall ${row.wall}`].filter(Boolean).join(' · ')||'No indexed spec')}</td><td class="${row.original.length?'present':'missing'}">${row.original.length?escape(row.original[0].split('/').pop()):'Missing'}</td><td>${row.reviewed.length?escape(row.reviewed[0].split('/').pop()):'—'}</td><td>${row.drawings.length?'Yes':'—'}</td></tr>`).join('')+'</tbody></table>';
      if(drawing){const svg=await zip.files[drawing].async('blob');imageUrl=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));image.src=imageUrl;image.hidden=false}
    }catch(error){status.textContent=`Could not review ZIP: ${error.message}`;counts.replaceChildren();table.replaceChildren()}
  };
})();
