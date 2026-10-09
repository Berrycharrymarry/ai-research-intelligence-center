import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const asset=path.resolve(site,'../gpu_5060ti_ultra_w');
const plan=JSON.parse(fs.readFileSync(path.join(site,'docs/evidence/assembly_plan.json'),'utf8'));
const english={gpu:'Graphics card',shroud:'Front shroud',cooling:'Cooling system',board:'PCB and board systems',backplate:'Backplate',io:'Video output and mounting'};
const category=id=>id.startsWith('fan.')?'Cooling fan':id.startsWith('cooling')?'Thermal system':id.startsWith('board')?'PCB system':id.startsWith('shroud')?'Exterior':id.startsWith('backplate')?'Backplate':id.startsWith('io')?'I/O system':'GPU';
const nodes=plan.nodes.map(n=>{
 const children=n.childIds||[]; const conceptual=n.evidence==='conceptual'; const leaf=!children.length;
 const service=n.joint==='service';
 return {...n,
   nameEn:english[n.id]||n.id.split('.').map(x=>x[0]?.toUpperCase()+x.slice(1)).join(' '),
   category:category(n.id),
   functionZh:leaf?`${n.nameZh}的结构与装配位置。`:`组织并连接${n.nameZh}的下级部件。`,
   functionEn:leaf?`Structure and installed position of ${n.nameZh}.`:`Groups the child parts of ${n.nameZh}.`,
   connections:n.parentId?[{targetId:n.parentId,type:n.joint==='bonded'?'bonded':service?'fastened':'integral'}]:[],
   locationZh:n.parentId?`位于${n.parentId}总成内。`:'显卡完整装配根节点。',
   teachingOnly:conceptual,
   capabilities:{select:n.kind!=='region',detach:n.kind==='part'&&service,drill:n.kind==='assembly'&&children.length>0,inspectRotate:['part','assembly'].includes(n.kind)},
   meshIds:[], restPivot:[0,0,0], restLocalMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], boundsRest:null,
   motion:{extractAxis:n.id==='backplate.panel'?[0,0,-1]:n.id.startsWith('io.')?[-1,0,0]:[0,0,1],clearance:0.012,parkingPriority:0,revealPrerequisites:[],preferredView:[0.1,0.18,1],durationMs:n.id==='gpu'?0:600},
 };
});
const manifest={schemaVersion:1,assetVersion:'gpu-lab-v1-r001',assetSha256:null,unit:'m',coordinateFrame:'BLENDER_X_LENGTH_Y_HEIGHT_Z_FRONT',basisConversion:'gltf_yup_to_assembly_rx90',rootId:'gpu',nodes,meshBindings:[],regions:plan.regions,features:plan.features,sourceBaseline:{blendSha256:plan.sourceSha256,glbSha256:plan.glbSha256,visibleSourceObjects:479},replacementLedger:[],depthExceptions:plan.depthExceptions};
const dir=path.join(asset,'interactive/specs');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'assembly.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({nodes:nodes.length,output:path.join(dir,'assembly.json')}));
