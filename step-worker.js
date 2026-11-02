importScripts('vendor/occt-import-js.js','step-split.js','mesh-section.js','step-specs.js');
let cadModule;
self.onmessage=async event=>{
  try{
    cadModule ||= await occtimportjs({locateFile:name=>`vendor/${name}`});
    const result=cadModule.ReadStepFile(new Uint8Array(event.data),{
      linearUnit:'inch',linearDeflectionType:'bounding_box_ratio',
      linearDeflection:0.003,angularDeflection:0.2
    });
    let parts=[],splitError=null,specs=[],specError=null;
    if(result.success&&result.meshes?.length){
      const source=new TextDecoder().decode(event.data);
      try{parts=StepSplitter.splitStepText(source,result.meshes.length)}
      catch(error){splitError=String(error?.message||error)}
      try{specs=StepSpecs.detectStepSpecs(source,result.meshes.length,result.meshes)}
      catch(error){specError=String(error?.message||error)}
    }
    self.postMessage({ok:true,result,parts,splitError,specs,specError});
  }catch(error){self.postMessage({ok:false,error:String(error?.message||error)})}
};
