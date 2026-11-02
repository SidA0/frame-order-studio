/* Midpoint section fallback for bodies without an analytic tube pair. */
(function(root){
  function inspect(mesh){
    const a=mesh?.attributes?.position?.array,idx=mesh?.index?.array;
    if(!a?.length||!idx?.length)return null;
    const count=a.length/3,center=[0,0,0];for(let i=0;i<a.length;i+=3)for(let k=0;k<3;k++)center[k]+=a[i+k]/count;
    const covariance=Array.from({length:3},()=>[0,0,0]);for(let i=0;i<a.length;i+=3){const d=[a[i]-center[0],a[i+1]-center[1],a[i+2]-center[2]];for(let j=0;j<3;j++)for(let k=0;k<3;k++)covariance[j][k]+=d[j]*d[k]}
    let axis=[1,1,1];for(let n=0;n<40;n++){const next=covariance.map(row=>row.reduce((sum,x,k)=>sum+x*axis[k],0)),length=Math.hypot(...next);if(!length)return null;axis=next.map(x=>x/length)}
    const helper=Math.abs(axis[2])<.9?[0,0,1]:[0,1,0],u=[axis[1]*helper[2]-axis[2]*helper[1],axis[2]*helper[0]-axis[0]*helper[2],axis[0]*helper[1]-axis[1]*helper[0]],ulen=Math.hypot(...u);for(let k=0;k<3;k++)u[k]/=ulen;const v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]];
    const intersections=[];for(let i=0;i<idx.length;i+=3){const p=[0,1,2].map(j=>{const n=idx[i+j]*3;return [a[n],a[n+1],a[n+2]]}),d=p.map(point=>point.reduce((s,x,k)=>s+(x-center[k])*axis[k],0));for(const [j,k] of [[0,1],[1,2],[2,0]])if(d[j]*d[k]<0){const t=d[j]/(d[j]-d[k]);intersections.push(p[j].map((x,q)=>x+t*(p[k][q]-x)))}}
    if(intersections.length<12)return null;
    const points=intersections.map(p=>[p.reduce((s,x,k)=>s+(x-center[k])*u[k],0),p.reduce((s,x,k)=>s+(x-center[k])*v[k],0)]),mid=[0,0];for(const p of points){mid[0]+=p[0]/points.length;mid[1]+=p[1]/points.length}
    const radii=points.map(p=>Math.hypot(p[0]-mid[0],p[1]-mid[1])).sort((x,y)=>x-y),quantile=q=>radii[Math.floor(q*(radii.length-1))];
    const outer=quantile(.9),inner=quantile(.1),spread=quantile(.95)-quantile(.65),wall=outer-inner;
    const circular=outer>.2&&spread/outer<.12&&wall>.018&&wall<.2&&wall/outer<.25;
    return {axis:axis.map(x=>Number(x.toFixed(4))),center:center.map(x=>Number(x.toFixed(4))),sectionPoints:points.length,outerDiameter:Number((2*outer).toFixed(4)),wall:Number(wall.toFixed(4)),circular,radialSpread:Number((spread/outer).toFixed(3))};
  }
  root.MeshSection={inspect};if(typeof module!=='undefined'&&module.exports)module.exports=root.MeshSection;
})(typeof self!=='undefined'?self:globalThis);
