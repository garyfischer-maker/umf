// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../../model/types';
import {parseNativeJson,renderTree,cloneTree,type NativeJson} from '../../model/native-json';
import {projectLakeview,elementKey,type LakeviewProjection} from './project';
type Obj=Extract<NativeJson,{kind:'object'}>;
export interface LakeviewExportIssue {path:string;code:string;classification:'representation-change'|'unsupported';detail:string;}
export interface LakeviewExport {text:string;issues:LakeviewExportIssue[];}
const LV='umf.lakeview',DASH='umf.dashboard',SQL='databricks-sql';
const lvx=(o:any)=>o?.extensions?.[LV] as any,dash=(o:any)=>o?.extensions?.[DASH] as any;
const S=(value:string):NativeJson=>({kind:'string',value}),N=(value:number):NativeJson=>({kind:'number',value:String(value)});
const T=(value:unknown):NativeJson=>parseNativeJson(JSON.stringify(value));
const canon=(v:any):string=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v)??'null';
const same=(a:unknown,b:unknown)=>canon(a)===canon(b);
const lines=(text:string)=>text.split(/(?<=\n)/);
const quote=(name:string)=>'`'+name.replaceAll('`','``')+'`';
const unquote=(text:string)=>/^`((?:[^`]|``)+)`$/.exec(text)?.[1]?.replaceAll('``','`');
// Reverse of the importer's tables; anything not listed here has no native spelling this exporter is willing to guess.
const controls:Record<string,string>={'single-select':'filter-single-select','multi-select':'filter-multi-select','date-range':'filter-date-range-picker','text-search':'filter-text-entry','range':'filter-range-slider'};
const channelKey:Record<string,string>={x:'x',y:'y',color:'color',size:'size',label:'label',value:'value',target:'target',angle:'angle',tooltip:'extra',column:'columns'};
const aggregate:Record<string,string>={sum:'SUM',avg:'AVG',min:'MIN',max:'MAX',count:'COUNT'};
const formats:Record<string,string>={number:'number',currency:'number-currency',percent:'number-percent'};
const specVersion:Record<string,number>={counter:2,table:2};
const roleKeys:Record<string,string>={canvasBackground:'canvasBackgroundColor',widgetBackground:'widgetBackgroundColor',widgetBorder:'widgetBorderColor',font:'fontColor',selection:'selectionColor'};
const str=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const member=(o:Obj|undefined,key:string)=>o?.members[key];
const objectOf=(n:NativeJson|undefined):Obj|undefined=>n?.kind==='object'?n:undefined;
/** Child object of `o`, created when absent; undefined when the member exists with another shape, which must not be overwritten. */
function child(o:Obj,key:string):Obj|undefined{const n=o.members[key];if(n===undefined){const created:Obj={kind:'object',members:{}};o.members[key]=created;return created;}return objectOf(n);}
function assemble(native:Obj,order:string[],parts:Record<string,NativeJson|undefined>):NativeJson{
 const keys=[...order,...Object.keys(parts).filter(k=>parts[k]!==undefined&&!order.includes(k))];
 return {kind:'object',members:Object.fromEntries(keys.filter(k=>Object.hasOwn(parts,k)?parts[k]!==undefined:native.members[k]!==undefined).map(k=>[k,Object.hasOwn(parts,k)?parts[k]!:native.members[k]!]))};
}
const array=(items:NativeJson[]):NativeJson=>({kind:'array',items});
/** Exports a neutral dashboard document to .lvdash.json text, reusing retained native JSON for every unchanged item. */
export function buildLakeviewExport(document:Document,retained:string|undefined):LakeviewExport{
 const root=dash(document);if(!root||root.kind!=='dashboard')throw new UmfError('LAKEVIEW_EXPORT','Expected a document-level umf.dashboard declaration');
 const issues:LakeviewExportIssue[]=[];
 const report=(path:string,code:string,classification:LakeviewExportIssue['classification'],detail:string)=>{issues.push({path,code,classification,detail});};
 const nativeRoot=lvx(document)?.kind==='dashboard'?lvx(document):undefined;
 const dataModules=document.modules.filter(m=>(dash(m)?.kind??lvx(m)?.kind)==='data');
 // Baseline: what the importer would project from the retained native content. A neutral item equal to it is unedited.
 let baseline:LakeviewProjection|undefined;
 if(nativeRoot&&retained!==undefined){
  const lvData=document.modules.find(m=>lvx(m)?.kind==='data'),lvPages=document.modules.filter(m=>lvx(m)?.kind==='page');
  baseline=projectLakeview(JSON.parse(retained),{data:lvData?.id??'data',datasets:(lvData?.elements??[]).filter(e=>lvx(e)?.kind==='dataset').map(e=>e.id),pages:lvPages.map(m=>({id:m.id,items:m.elements.filter(e=>lvx(e)?.kind==='layout-item').map(e=>e.id)}))},{title:root.title});
 }
 const baseOf=(module:string,element:string)=>baseline?.elements.get(elementKey(module,element));
 const columns:number=root.layout?.columns;
 const gridChanged=baseline&&!same((baseline.root as any).layout,root.layout);
 if(gridChanged)report('/pages','LAKEVIEW_EXPORT_EDIT','unsupported','Grid columns changed from '+JSON.stringify((baseline!.root as any).layout)+' to '+JSON.stringify(root.layout)+'; positions of retained widgets are written without rescaling');
 // Edits of a neutral member that no native member is written for are reported and the retained native content is kept.
 const unwritten=(path:string,base:any,cur:any,handled:string[])=>{for(const key of new Set([...Object.keys(base),...Object.keys(cur)]))if(!handled.includes(key)&&!same(base[key],cur[key]))report(path,'LAKEVIEW_EXPORT_EDIT','unsupported','Neutral member '+JSON.stringify(key)+' changed but has no native write rule; the retained native content is unchanged');};
 const unexpressed=(path:string,payload:any,known:string[])=>{for(const key of Object.keys(payload))if(!known.includes(key))report(path,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Neutral member '+JSON.stringify(key)+' has no native spelling and is not written');};
 const language=(path:string,expression:any)=>{if(expression&&expression.language!==SQL)report(path,'LAKEVIEW_EXPORT_ASSUMPTION','representation-change','Expression language '+JSON.stringify(expression.language)+' is written as Databricks SQL');};

 // ---- datasets
 const datasetNames=new Map<string,string>(),datasetItems:NativeJson[]=[];
 const taken=new Set<string>();
 const unique=(wanted:string)=>{let id=wanted,n=1;while(taken.has(id))id=wanted+'_'+(++n);taken.add(id);return id;};
 for(const module of dataModules)for(const element of module.elements){
  const cur=dash(element),own=lvx(element),at='/datasets/'+datasetItems.length;
  if(cur?.kind!=='dataset'&&own?.kind!=='dataset')continue;
  if(own?.kind==='dataset'){
   const native=cloneTree(own.native) as Obj,name=str(member(native,'name'))??element.id;taken.add(name);datasetNames.set(JSON.stringify([module.id,element.id]),name);
   const base=baseOf(module.id,element.id) as any;
   if(cur?.kind==='dataset'&&base&&!same(base,cur)){
    if(base.title!==cur.title)native.members.displayName=S(cur.title);
    const bq=base.source?.query?.text,cq=cur.source?.query?.text;
    if(base.source?.kind==='query'&&cur.source?.kind==='query'&&bq!==cq){
     if(native.members.queryLines?.kind==='array')native.members.queryLines=T(lines(cq));else if(native.members.query?.kind==='string')native.members.query=S(cq);
    } else if(!same(base.source,cur.source))report(at,'LAKEVIEW_EXPORT_EDIT','unsupported','Dataset source changed shape; the retained native query is unchanged');
    unwritten(at,base,cur,['title','source']);
   }
   datasetItems.push(native);continue;
  }
  const name=unique(element.id);datasetNames.set(JSON.stringify([module.id,element.id]),name);
  const obj:any={name,displayName:cur.title};
  if(cur.source.kind==='query'){obj.queryLines=lines(cur.source.query.text);language(at,cur.source.query);}
  else{obj.queryLines=['SELECT * FROM '+cur.source.table];report(at,'LAKEVIEW_EXPORT_ASSUMPTION','representation-change','Table source '+JSON.stringify(cur.source.table)+' is written as SELECT * FROM the table');}
  const measures=Object.entries<any>(cur.fields).filter(([,f])=>f.role==='measure'&&f.expression);
  if(measures.length)obj.columns=measures.map(([key,f])=>{language(at+'/columns',f.expression);return {displayName:key,expression:f.expression.text,...(f.description?{description:f.description}:{})};});
  for(const [key,f] of Object.entries<any>(cur.fields))if(f.role==='measure'&&!f.expression)report(at,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Measure '+JSON.stringify(key)+' has no expression and is not written');else if(f.role==='column'&&(f.type||f.title||f.description))report(at,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Column '+JSON.stringify(key)+' type, title or description has no native dataset member and is not written');
  unexpressed(at,cur,['kind','title','source','fields']);
  datasetItems.push(T(obj));
 }
 const datasetName=(ref:any,path:string)=>{const name=datasetNames.get(JSON.stringify([ref.module,ref.element]));if(!name)throw new UmfError('LAKEVIEW_EXPORT','Neutral item at '+path+' reads a dataset that is not exported: '+JSON.stringify(ref));return name;};

 // ---- widgets
 const versions=new Set<string>();
 const assumeVersions=()=>{if(versions.size)report('','LAKEVIEW_EXPORT_ASSUMPTION','representation-change','Widget spec versions were assumed for synthesized '+[...versions].join(', ')+' widgets (counter and table 2, filters 2, other charts 3); they have not been checked against a Databricks workspace');};
 const synthText=(cur:any,name:string,path:string)=>{
  if(cur.content.format!=='markdown')report(path,'LAKEVIEW_EXPORT_ASSUMPTION','representation-change','Plain text is written as a markdown text box');
  unexpressed(path,cur,['kind','content','position','trace']);
  return {widget:{name,multilineTextboxSpec:{lines:lines(cur.content.text)}}};
 };
 const sortOf=(sort:any,channel:string)=>{
  if(!sort)return undefined;const other=channel==='x'?'y':'x';
  if(sort.by==='custom')return {by:'custom-order',orderedValues:sort.values};
  const [kind,direction]=String(sort.by).split('-'),reversed=direction==='descending'?'-reversed':'';
  return {by:(kind==='label'?'natural-order':other)+reversed};
 };
 const synthVisual=(cur:any,name:string,path:string)=>{
  const fields=new Map<string,{name:string;expression:string}>(),names=new Set<string>();
  const queryField=(enc:any)=>{
   const expression=enc.aggregation==='none'?quote(enc.field):enc.aggregation==='measure'?'MEASURE('+quote(enc.field)+')':enc.aggregation==='custom'?enc.expression?.text:enc.aggregation==='count-distinct'?'COUNT(DISTINCT '+quote(enc.field)+')':aggregate[enc.aggregation]+'('+quote(enc.field)+')';
   if(expression===undefined)return undefined;if(enc.aggregation==='custom')language(path,enc.expression);
   let entry=fields.get(expression);
   if(!entry){const base=['none','measure'].includes(enc.aggregation)?enc.field:enc.aggregation+'('+enc.field+')';let n=base,i=1;while(names.has(n))n=base+'_'+(++i);names.add(n);entry={name:n,expression};fields.set(expression,entry);}
   return entry.name;
  };
  const byChannel=new Map<string,any[]>();
  for(const enc of cur.encodings){
   if(!channelKey[enc.channel]){report(path,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Encoding channel '+JSON.stringify(enc.channel)+' for field '+JSON.stringify(enc.field)+' has no native spelling and is not written');continue;}
   if(queryField(enc)===undefined){report(path,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Custom aggregation of '+JSON.stringify(enc.field)+' has no expression and is not written');continue;}
   (byChannel.get(enc.channel)??byChannel.set(enc.channel,[]).get(enc.channel)!).push(enc);
  }
  const entry=(enc:any,shared=true)=>{
   const out:any={fieldName:queryField(enc)};if(enc.title)out.displayName=enc.title;
   if(shared){
    const scale:any={};if(enc.scale)scale.type=enc.scale;const sort=sortOf(enc.sort,enc.channel);if(sort)scale.sort=sort;if(Object.keys(scale).length)out.scale=scale;
    if(enc.format){
     if(!formats[enc.format.kind])report(path,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Format kind '+JSON.stringify(enc.format.kind)+' has no native spelling and is not written');
     else{const f:any={type:formats[enc.format.kind]};if(enc.format.currency)f.currencyCode=enc.format.currency;if(enc.format.abbreviation)f.abbreviation=enc.format.abbreviation;if(enc.format.decimals!==undefined)f.decimalPlaces={type:'exact',places:enc.format.decimals};out.format=f;}
    }
   }
   return out;
  };
  const encodings:any={};
  for(const [channel,list] of byChannel){
   const key=channelKey[channel]!;
   if(['tooltip','column','label'].includes(channel))encodings[key]=list.map(e=>entry(e));
   else if(channel==='y'&&list.length>1){
    const first=entry(list[0]),{scale,format}=first;
    if(list.slice(1).some(e=>!same(entry(e).scale,scale)||!same(entry(e).format,format)))report(path,'LAKEVIEW_EXPORT_ASSUMPTION','representation-change','Repeated y encodings share the scale and format of the first one');
    encodings[key]={fields:list.map(e=>{const {scale:_s,format:_f,...rest}=entry(e);return rest;}),...(scale?{scale}:{}),...(format?{format}:{})};
   } else {
    if(list.length>1)report(path,'LAKEVIEW_EXPORT_UNEXPRESSED','unsupported','Only one '+channel+' encoding can be written; the others are dropped');
    encodings[key]=entry(list[0]);
   }
  }
  const frame:any={title:cur.title,showTitle:true,...(cur.description?{description:cur.description,showDescription:true}:{})};
  versions.add(cur.chart);
  unexpressed(path,cur,['kind','title','description','trace','chart','dataset','rows','encodings','position']);
  return {widget:{name,queries:[{name:'main_query',query:{datasetName:datasetName(cur.dataset,path),fields:[...fields.values()].map(f=>({name:f.name,expression:f.expression})),disaggregated:cur.rows==='detail'}}],spec:{version:specVersion[cur.chart]??3,widgetType:cur.chart,encodings,frame}}};
 };
 const synthFilter=(cur:any,name:string,path:string)=>{
  const queries=cur.targets.map((t:any,i:number)=>({name:'query_'+i,query:{datasetName:datasetName(t.dataset,path),fields:[{name:t.field,expression:quote(t.field)}],disaggregated:false}}));
  const spec:any={version:2,widgetType:controls[cur.control],encodings:{fields:cur.targets.map((t:any,i:number)=>({fieldName:t.field,queryName:'query_'+i}))},frame:{title:cur.title,showTitle:true,...(cur.description?{description:cur.description,showDescription:true}:{})}};
  if(cur.default?.values?.length)spec.selection={defaultSelection:{values:{dataType:typeof cur.default.values[0]==='string'?'STRING':typeof cur.default.values[0]==='number'?'DECIMAL':'BOOLEAN',values:cur.default.values.map((value:unknown)=>({value}))}}};
  versions.add('filter');
  unexpressed(path,cur,['kind','title','description','trace','control','targets','default','position']);
  return {widget:{name,queries,spec}};
 };
 const posOf=(p:any)=>({x:p.x,y:p.y,width:p.width,height:p.height});
 function patchWidget(item:Obj,base:any,cur:any,scale:number,path:string,nativeDatasetOf:(ref:any)=>string):void{
  const widget=child(item,'widget');if(!widget)return;
  const spec=objectOf(member(widget,'spec')),handled=['kind','position'];
  if(cur.kind==='text'){
   handled.push('content');
   if(!same(base.content,cur.content)){
    const box=objectOf(member(widget,'multilineTextboxSpec'));
    if(box?.members.lines?.kind==='array')box.members.lines=T(lines(cur.content.text));else if(widget.members.textbox_spec?.kind==='string')widget.members.textbox_spec=S(cur.content.text);
   }
  } else if(spec){
   handled.push('title','description');
   const frame=child(spec,'frame');
   if(frame&&base.title!==cur.title)frame.members.title=S(cur.title);
   if(frame&&base.description!==cur.description){if(cur.description===undefined)delete frame.members.description;else frame.members.description=S(cur.description);}
   if(cur.kind==='filter'){handled.push('targets');patchTargets(widget,base,cur,path,nativeDatasetOf);}
  }
  if(!same(base.position,cur.position)){
   const pos=child(item,'position');
   if(pos)for(const k of ['x','width'] as const)if(base.position[k]!==cur.position[k]){if(cur.position[k]%scale)report(path,'LAKEVIEW_EXPORT_EDIT','unsupported','Legacy six-column page cannot hold '+k+' '+cur.position[k]+' of the twelve-column grid; the native position is unchanged');else pos.members[k]=N(cur.position[k]/scale);}
   if(pos)for(const k of ['y','height'] as const)if(base.position[k]!==cur.position[k])pos.members[k]=N(cur.position[k]);
  }
  unwritten(path,base,cur,handled);
 }
 function patchTargets(widget:Obj,base:any,cur:any,path:string,nativeDatasetOf:(ref:any)=>string):void{
  if(same(base.targets,cur.targets))return;
  if(base.targets.length!==cur.targets.length){report(path,'LAKEVIEW_EXPORT_EDIT','unsupported','Filter targets were added or removed; the retained native filter is unchanged');return;}
  const queries=member(widget,'queries'),fields=member(objectOf(member(objectOf(member(widget,'spec')),'encodings')),'fields');
  if(queries?.kind!=='array'||fields?.kind!=='array')return;
  const seen=new Map<string,number>();
  for(const f of fields.items){
   const fo=objectOf(f),queryName=str(member(fo,'queryName')),fieldName=str(member(fo,'fieldName'));
   if(!fo||fo.members.parameterName!==undefined||queryName===undefined||fieldName===undefined)continue;
   const q=objectOf(queries.items.find(x=>str(member(objectOf(x),'name'))===queryName)),query=objectOf(member(q,'query')),list=member(query,'fields');
   const entry=list?.kind==='array'?list.items.map(objectOf).find(x=>str(member(x,'name'))===fieldName):undefined,column=unquote(str(member(entry,'expression'))??'');
   if(!query||!entry||column===undefined)continue;
   const key=JSON.stringify([str(member(query,'datasetName')),column]);
   let index=seen.get(key);if(index===undefined){index=seen.size;seen.set(key,index);}
   const was=base.targets[index],now=cur.targets[index];if(!now||same(was,now))continue;
   query.members.datasetName=S(nativeDatasetOf(now.dataset));entry.members.expression=S(quote(now.field));
  }
 }
 // ---- pages
 const pageItems:NativeJson[]=[];
 const pageIds:string[]=root.pages;
 for(const id of pageIds){
  const module=document.modules.find(m=>m.id===id),cur=dash(module);
  if(!module||cur?.kind!=='page')throw new UmfError('LAKEVIEW_EXPORT','Dashboard page '+JSON.stringify(id)+' is not a page module');
  const path='/pages/'+pageItems.length,own=lvx(module)?.kind==='page'?lvx(module):undefined;
  const native=own?cloneTree(own.native) as Obj:undefined;
  const scale=native&&native.members.layoutVersion===undefined&&columns===12?2:1;
  const layout:NativeJson[]=[];
  for(const element of module.elements){
   const ec=dash(element),eo=lvx(element),ep=path+'/layout/'+layout.length;
   if(ec&&!['visual','text','filter'].includes(ec.kind))continue;
   if(eo?.kind==='layout-item'){
    const item=cloneTree(eo.native) as Obj,base=baseOf(module.id,element.id) as any;
    if(ec&&base&&base.kind===ec.kind&&!same(base,ec))patchWidget(item,base,ec,scale,ep,ref=>datasetName(ref,ep));
    else if(ec&&base&&base.kind!==ec.kind)report(ep,'LAKEVIEW_EXPORT_EDIT','unsupported','Neutral kind changed from '+base.kind+' to '+ec.kind+'; the retained native widget is unchanged');
    layout.push(item);continue;
   }
   if(!ec)continue;
   const name=element.id,body:any=ec.kind==='text'?synthText(ec,name,ep):ec.kind==='visual'?synthVisual(ec,name,ep):synthFilter(ec,name,ep);
   layout.push(T({...body,position:posOf(ec.position)}));
  }
  if(native&&own){
   if(baseline){
    const base=baseline.modules.get(module.id) as any;
    if(base&&!same(base,cur)){
     if(base.title!==cur.title)native.members.displayName=S(cur.title);
     if(base.role!==cur.role)native.members.pageType=S(cur.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS');
     unwritten(path,base,cur,['title','role']);
    }
   }
   pageItems.push(assemble(native,own.order,{layout:Object.hasOwn(native.members,'layout')||layout.length?array(layout):undefined}));
  } else {
   if(columns!==6&&columns!==12)report(path,'LAKEVIEW_EXPORT_ASSUMPTION','representation-change','Grid of '+columns+' columns is written as the twelve-column GRID_V1 layout');
   unexpressed(path,cur,['kind','title','role','description']);
   pageItems.push({kind:'object',members:{name:S(id),displayName:S(cur.title),layout:array(layout),pageType:S(cur.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS'),...(columns===6?{}:{layoutVersion:S('GRID_V1')})}});
  }
 }
 // ---- dashboard
 const theme=(t:any)=>{const out:any={};if(t?.fontFamily)out.fontFamily=t.fontFamily;if(t?.palette)out.visualizationColors=t.palette;for(const [role,color] of Object.entries<any>(t?.roles??{}))out[roleKeys[role]!]=color;return out;};
 if(nativeRoot){
  const native=cloneTree(nativeRoot.native) as Obj,order:string[]=[...nativeRoot.order];
  if(baseline&&!same((baseline.root as any).theme??{},root.theme??{})){
   const ui=child(native,'uiSettings'),t=ui&&child(ui,'theme');
   if(t){for(const [key,value] of Object.entries(theme(root.theme)))t.members[key]=T(value);if(!order.includes('uiSettings'))order.push('uiSettings');}
   else report('/uiSettings','LAKEVIEW_EXPORT_EDIT','unsupported','Theme changed but the retained uiSettings are not an object; the native theme is unchanged');
  }
  const {title:_t,pages:_p,layout:_l,theme:_th,...rest}=root;void _t;void _p;void _l;void _th;
  if(baseline){const {title:_bt,pages:_bp,layout:_bl,theme:_bth,...baseRest}=baseline.root as any;void _bt;void _bp;void _bl;void _bth;unwritten('',baseRest,rest,[]);}
  const hadDatasets=nativeRoot.native.members.datasets!==undefined||nativeRoot.order.includes('datasets'),hadPages=nativeRoot.order.includes('pages');
  assumeVersions();
  return {text:renderTree(assemble(native,order,{datasets:hadDatasets||datasetItems.length?array(datasetItems):undefined,pages:hadPages||pageItems.length?array(pageItems):undefined})),issues};
 }
 unexpressed('',root,['kind','title','pages','layout','theme']);
 const tree:Record<string,NativeJson>={datasets:array(datasetItems),pages:array(pageItems)};
 const ui=theme(root.theme);if(Object.keys(ui).length)tree.uiSettings=T({theme:ui});
 report('','LAKEVIEW_EXPORT_ASSUMPTION','representation-change','No retained native dashboard: every member was synthesized from the neutral declaration and has not been checked against a Databricks workspace');
 assumeVersions();
 return {text:renderTree({kind:'object',members:tree}),issues};
}
