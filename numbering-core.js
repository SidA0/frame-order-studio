/* Find opposite-side geometry that STEP cannot semantically number on its own. */
(function(scope){
  function mirroredPairs(bodies,tolerance=.05){
    if(!bodies.length)return [];
    const minY=Math.min(...bodies.map(body=>body.bounds.lo[1]));
    const maxY=Math.max(...bodies.map(body=>body.bounds.hi[1]));
    const plane=(minY+maxY)/2;
    const candidates=[];
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i].bounds,b=bodies[j].bounds;
      const ay=(a.lo[1]+a.hi[1])/2,by=(b.lo[1]+b.hi[1])/2;
      if((ay-plane)*(by-plane)>=0||Math.abs(ay-by)<.1)continue;
      const error=Math.abs(a.lo[0]-b.lo[0])+Math.abs(a.hi[0]-b.hi[0])+
        Math.abs(a.lo[2]-b.lo[2])+Math.abs(a.hi[2]-b.hi[2])+
        Math.abs(a.lo[1]+b.hi[1]-2*plane)+Math.abs(a.hi[1]+b.lo[1]-2*plane);
      if(error<tolerance)candidates.push({a:i,b:j,error});
    }
    candidates.sort((a,b)=>a.error-b.error);
    const used=new Set(),pairs=[];
    for(const candidate of candidates){
      if(used.has(candidate.a)||used.has(candidate.b))continue;
      used.add(candidate.a);used.add(candidate.b);
      pairs.push({a:bodies[candidate.a].number,b:bodies[candidate.b].number,error:candidate.error});
    }
    return pairs.sort((a,b)=>a.a-b.a||a.b-b.b);
  }
  function validateNumbers(bodies,numberFor){
    const numbers=bodies.map(numberFor);
    return numbers.every(n=>Number.isInteger(n)&&n>0)&&new Set(numbers).size===numbers.length;
  }
  scope.NumberingCore={mirroredPairs,validateNumbers};
})(typeof window==='undefined'?globalThis:window);
