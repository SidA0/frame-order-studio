/* Manufacturer handoff: preserve source CAD and make unresolved cut geometry explicit. */
const manufacturingButton=document.createElement('button');
manufacturingButton.id='manufacturingExport';
manufacturingButton.className='secondary';
manufacturingButton.textContent='Download source alignment + cut audit ZIP ↓';
$('stepPackage').after(manufacturingButton);

function laserCutReviewRows(){
  return cadBodies.map(body=>{
    const spec=cadSpecs[body.number-1]||{},detailed=window.currentLaserAuditRows?.find(row=>row.body===body.number),planes=detailed?.cut_faces?.filter(face=>face.basis==='sampled planar face'&&face.max_tilt_deg!=null)||[],tilts=spec.planeTilts||[],max=planes.length?Math.max(...planes.map(face=>face.max_tilt_deg)):tilts.length?Math.max(...tilts):null;
    return [bodyBalloonNumber(body),body.number,body.name,tubeFileBase(body),spec.type||'Unspecified',spec.od||'',spec.wall||'',max===null?'':fmt(max,1),detailed?.status||'NOT VERIFIED',
      'Through-wall cut straightness not verified from split STEP',spec.type==='Unspecified'?'Profile requires CAD review':'',
      'Retain as part; revise cope in native CAD before manufacturing release'];
  });
}

async function downloadLaserCutReview(){
  if(!cadBodies.length)return;
  if(typeof JSZip==='undefined')return stepStatus('ZIP library did not load.',true);
  const zip=new JSZip(),source=zip.folder('SOURCE-STEP-UNMODIFIED'),drawings=zip.folder('DRAWINGS-REVIEW-ONLY');
  if(cadSourceFile)zip.file('ASSEMBLY-SOURCE-UNMODIFIED.step',await cadSourceFile.arrayBuffer());
  if(typeof assemblySvg==='function')zip.file('assembly-balloons.svg',assemblySvg());
  const rows=laserCutReviewRows();
  for(let i=0;i<cadBodies.length;i++){
    const body=cadBodies[i],base=tubeFileBase(body);
    source.file(`${base}.step`,cadParts[i].bytes);
    const svg=stepSvg(body).replace('</svg>','<text x="34" y="773" font-family="Arial" font-size="11" font-weight="700" fill="#a13e2b">LASER CUT REVIEW: MAX 45° TILT; STRAIGHT LOCAL CUT THROUGH WALL; CAD GEOMETRY UNVERIFIED</text></svg>');
    drawings.file(`${base}.svg`,svg);
    if(i%8===0){stepStatus(`Preparing laser-cut review ${i+1} / ${cadBodies.length}…`);await new Promise(requestAnimationFrame)}
  }
  zip.file('laser-cut-review.csv',csv([['balloon number','STEP body','source body name','export base name','tube type','OD in','wall in','max planar-face tilt candidate deg','45 degree screen','cut-wall straightness','profile review','required action'],...rows]));
  if(window.currentLaserAuditRows)zip.file('laser-tilt-45-audit.json',JSON.stringify(window.currentLaserAuditRows,null,2));
  zip.file('CAD-REWORK-REQUIREMENTS.txt',`${cadFilename}\n\nMANUFACTURER DFM REVIEW HANDOFF - NOT A CORRECTED CAD RELEASE\n\nASSEMBLY-SOURCE-UNMODIFIED.step contains all bodies in their original positions for alignment. Individual STEP files retain the same coordinates and balloon numbers.\n\n1. Maximum laser-head tilt is 45 degrees from a perpendicular through-wall cut. Rework any cope location exceeding this limit.\n2. Each local cut through the tube wall must be a straight line. A curved cut path around the tube is allowed; a curved profile through the wall thickness is not.\n3. Revise source CAD cope features, regenerate the solids, and verify tube fit, end trims, wall, bend geometry, and balloon numbers.\n4. The CSV lists planar-face tilt candidates only. It cannot prove that all local cope surfaces meet either requirement. A blank or low candidate angle is not a pass.\n5. All ${cadBodies.length} source bodies are retained. No original STEP geometry has been modified in this handoff.\n\nDo not release SOURCE-STEP-UNMODIFIED for cutting as DFM-approved geometry.\n`);
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:3}});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${cadFilename.replace(/\.(step|stp)$/i,'')}-source-alignment-cut-audit.zip`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),60000);
  stepStatus('Source alignment and cut audit ZIP downloaded. Source geometry remains unmodified pending native CAD rework.');
}

manufacturingButton.onclick=()=>downloadLaserCutReview().catch(error=>stepStatus(`Could not create laser-cut review: ${error.message}`,true));
