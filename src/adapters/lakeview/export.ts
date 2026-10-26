// SPDX-License-Identifier: MIT OR Apache-2.0
import {parseNativeJson,type NativeJson} from '../../model/native-json';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Json} from '../../model/types';
import {inspectDashboard,DASHBOARD_EXTENSION} from '../../extensions/dashboard';
import {projectLakeview,elementKey,type LakeviewProjection} from './project';
export interface LakeviewExportIssue {path:string;code:'LAKEVIEW_EXPORT_ASSUMPTION'|'LAKEVIEW_EXPORT_UNSYNCED'|'LAKEVIEW_EXPORT_UNSUPPORTED';detail:string;}
type ObjectTree=Extract<NativeJson,{kind:'object'}>;
const LV='umf.lakeview';
const lv=(owner:{extensions?:Record<string,Json>}|undefined)=>owner?.extensions?.[LV] as any;
const dash=(owner:{extensions?:Record<string,Json>}|undefined)=>owner?.extensions?.[DASHBOARD_EXTENSION] as any;
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const toTree=(value:unknown):NativeJson=>parseNativeJson(JSON.stringify(value));
const str=(value:string):NativeJson=>({kind:'string',value});
const num=(value:number):NativeJson=>({kind:'number',value:String(value)});
const obj=(members:Record<string,NativeJson>):ObjectTree=>({kind:'object',members});
const tick=(name:string)=>'`'+name.replaceAll('`','``')+'`';
const lines=(text:string)=>text.split(/(?<=\n)/);
function setIn(tree:NativeJson,path:string[],node:NativeJson):NativeJson{
 if(!path.length)return node;
 const [head,...rest]=path;
 if(tree.kind==='array'){const items=[...tree.items],i=Number(head);items[i]=setIn(items[i]!,rest,node);return {kind:'array',items};}
 const members={...(tree.kind==='object'?tree.members:{})};
 members[head!]=setIn(members[head!]??obj({}),rest,node);
 return {kind:'object',members};
}
const controls:Record<string,string>={'single-select':'filter-single-select','multi-select':'filter-multi-select','date-range':'filter-date-range-picker','text-search':'filter-text-entry','range':'filter-range-slider'};
const channelKeys:Record<string,string>={x:'x',y:'y',color:'color',size:'size',label:'label',value:'value',target:'target',angle:'angle',tooltip:'extra',column:'columns'};
const formatTypes:Record<string,string>={number:'number',currency:'number-currency',percent:'number-percent'};
const aggregates:Record<string,string>={sum:'SUM',avg:'AVG',min:'MIN',max:'MAX',count:'COUNT'};
/** Neutral content that differs from the retained native view, by top-level member. */
function differences(current:any,projected:any):string[]{
 if(!projected)return ['(no native counterpart)'];
 return [...new Set([...Object.keys(current),...Object.keys(projected)])].filter(k=>k!=='trace'&&!eq(current[k],projected[k]));
}
type Render=(document:Document)=>string;
interface Layout {data:string;datasets:string[];pages:{id:string;items:string[]}[];}
/** Ids of the elements that carry native payloads, in native order. */
function layoutOf(document:Document):Layout{
 const data=document.modules.filter(m=>lv(m)?.kind==='data');
 return {data:data[0]?.id??'',datasets:data.flatMap(m=>m.elements.filter(e=>lv(e)?.kind==='dataset').map(e=>e.id)),
  pages:document.modules.filter(m=>lv(m)?.kind==='page').map(m=>({id:m.id,items:m.elements.filter(e=>lv(e)?.kind==='layout-item').map(e=>e.id)}))};
}
function reproject(document:Document,view:any):{projection:LakeviewProjection;layout:Layout}{
 const layout=layoutOf(document);
 return {projection:projectLakeview(view,layout,{title:dash(document)?.title??''}),layout};
}
/** Lakeview names of datasets by element id; retained datasets keep their native `name`. */
function datasetNames(document:Document):Map<string,string>{
 const names=new Map<string,string>();
 for(const m of document.modules)for(const e of m.elements)if(dash(e)?.kind==='dataset'){const n=lv(e)?.native?.members?.name;names.set(JSON.stringify([m.id,e.id]),n?.kind==='string'?n.value:e.id);}
 return names;
}
function synthesizer(document:Document,issues:LakeviewExportIssue[]){
 const names=datasetNames(document),columns:number=dash(document).layout.columns;
 const assume=(path:string,detail:string)=>issues.push({path,code:'LAKEVIEW_EXPORT_ASSUMPTION',detail});
 const unsupported=(path:string,detail:string)=>issues.push({path,code:'LAKEVIEW_EXPORT_UNSUPPORTED',detail});
 const scaleFor=(page:any)=>columns===12&&page?.layoutVersion===undefined?2:1;
 const position=(p:any,scale:number,path:string)=>{
  if(p.x%scale||p.width%scale)assume(path+'/position','Position x/width are not whole units on the six-column native grid; they are rounded down');
  return {x:Math.floor(p.x/scale),y:p.y,width:Math.max(1,Math.floor(p.width/scale)),height:p.height};
 };
 function dataset(id:string,d:any,path:string){
  const out:any={name:id,displayName:d.title};
  if(d.source.kind==='query'){
   if(d.source.query.language!=='databricks-sql')assume(path+'/source','Query language '+JSON.stringify(d.source.query.language)+' is written as Databricks SQL without translation');
   out.queryLines=lines(d.source.query.text);
  } else {assume(path+'/source','Table source '+JSON.stringify(d.source.table)+' is written as a SELECT * query');out.queryLines=['SELECT * FROM '+d.source.table];}
  const measures=Object.entries<any>(d.fields).filter(([,f])=>f.role==='measure');
  if(measures.length)out.columns=measures.map(([name,f])=>({displayName:name,...(f.description?{description:f.description}:{}),expression:f.expression.text}));
  if(d.grain)unsupported(path,'Dataset grain has no native member');
  if(Object.values<any>(d.fields).some(f=>f.role==='column'&&(f.type||f.title||f.description)))unsupported(path,'Column types, titles and descriptions have no native member; plain columns are declared only by use');
  return out;
 }
 function entry(e:any,path:string){
  const out:any={fieldName:e.key};
  if(e.title!==undefined)out.displayName=e.title;
  const scale:any={};if(e.scale)scale.type=e.scale;
  if(e.sort){
   const by=e.sort.by;
   if(by==='custom')scale.sort={by:'custom-order',orderedValues:e.sort.values};
   else{const descending=by.endsWith('descending'),other=e.channel==='x'?'y':'x';
    scale.sort={by:by.startsWith('label')?(e.scale==='categorical'?'alphabetical':'natural-order')+(descending?'-reversed':''):other+(descending?'-reversed':'')};
    if(by.startsWith('label'))assume(path,'Label sort is written as '+scale.sort.by+'; the native file distinguishes natural from alphabetical order');}
  }
  if(Object.keys(scale).length)out.scale=scale;
  if(e.format){
   const f:any={type:formatTypes[e.format.kind]};
   if(e.format.currency)f.currencyCode=e.format.currency;if(e.format.abbreviation)f.abbreviation=e.format.abbreviation;
   if(e.format.decimals!==undefined)f.decimalPlaces={type:'exact',places:e.format.decimals};
   out.format=f;
  }
  return out;
 }
 function queryField(e:any){
  const f=tick(e.field);
  switch(e.aggregation){
   case 'none':return {name:e.field,expression:f};
   case 'measure':return {name:'measure('+e.field+')',expression:'MEASURE('+f+')'};
   case 'count-distinct':return {name:'countdistinct('+e.field+')',expression:'COUNT(DISTINCT '+f+')'};
   case 'custom':return {name:e.field+'_custom',expression:e.expression.text};
   default:return {name:e.aggregation+'('+e.field+')',expression:aggregates[e.aggregation]+'('+f+')'};
  }
 }
 function widget(id:string,v:any,path:string):any{
  if(v.kind==='text'){
   if(v.content.format==='plain')assume(path+'/content','Plain text is written as a Markdown text box');
   return {name:id,multilineTextboxSpec:{lines:lines(v.content.text)}};
  }
  const frame:any={showTitle:true,title:v.title,...(v.description!==undefined?{showDescription:true,description:v.description}:{})};
  if(v.kind==='filter'){
   const queries:any[]=[],fields:any[]=[],byDataset=new Map<string,any>();
   for(const t of v.targets){
    const key=JSON.stringify([t.dataset.module,t.dataset.element]);let q=byDataset.get(key);
    if(!q){q={name:'q_'+id+'_'+t.dataset.element,query:{datasetName:names.get(key)??t.dataset.element,fields:[],disaggregated:false}};byDataset.set(key,q);queries.push(q);}
    q.query.fields.push({name:t.field,expression:tick(t.field)});
    fields.push({fieldName:t.field,displayName:v.title,queryName:q.name});
   }
   const spec:any={version:2,widgetType:controls[v.control],encodings:{fields},frame};
   if(v.default)spec.selection={defaultSelection:{values:{dataType:typeof v.default.values[0]==='number'?'DECIMAL':typeof v.default.values[0]==='boolean'?'BOOLEAN':'STRING',values:v.default.values.map((value:unknown)=>({value}))}}};
   if(v.default&&!v.default.values.every((x:unknown)=>typeof x===typeof v.default.values[0]))assume(path+'/default','Default values of mixed types are written under one data type');
   assume(path,'Filter queries omit the associative-filter predicate that Lakeview adds for value narrowing between filters');
   return {name:id,queries,spec};
  }
  const detail=v.rows==='detail',queryFields:any[]=[],byName=new Map<string,string>(),grouped=new Map<string,any[]>();
  const dsKey=JSON.stringify([v.dataset.module,v.dataset.element]);
  for(const [i,e] of v.encodings.entries()){
   if(!channelKeys[e.channel]){unsupported(path+'/encodings/'+i,'Channel '+e.channel+' has no native encoding; it is omitted');continue;}
   const q=queryField(e);
   if(!byName.has(q.name)){byName.set(q.name,q.expression);queryFields.push(q);}
   else if(byName.get(q.name)!==q.expression)assume(path+'/encodings/'+i,'Two aggregations share the query field name '+JSON.stringify(q.name));
   (grouped.get(e.channel)??grouped.set(e.channel,[]).get(e.channel)!).push(entry({...e,key:q.name},path+'/encodings/'+i));
  }
  const encodings:any={};
  for(const [channel,list] of grouped){
   const key=channelKeys[channel]!;
   if(channel==='tooltip'||channel==='column')encodings[key]=list;
   else if(list.length===1)encodings[key]=list[0];
   else{const {scale,...first}=list[0];encodings[key]={...(scale?{scale}:{}),fields:list.map(({scale:_,...rest})=>rest)};void first;}
  }
  const version=v.chart==='counter'||v.chart==='table'?2:3;
  return {name:id,queries:[{name:'main_query',query:{datasetName:names.get(dsKey)??v.dataset.element,fields:queryFields,disaggregated:detail}}],spec:{version,widgetType:v.chart,encodings,frame}};
 }
 function theme(t:any,path:string){
  const out:any={},roles:Record<string,string>={canvasBackground:'canvasBackgroundColor',widgetBackground:'widgetBackgroundColor',widgetBorder:'widgetBorderColor',font:'fontColor',selection:'selectionColor'};
  for(const [role,native] of Object.entries(roles))if(t.roles?.[role])out[native]={...t.roles[role]};
  if(t.palette)out.visualizationColors=[...t.palette];
  if(t.fontFamily)out.fontFamily=t.fontFamily;
  if(t.name)unsupported(path,'Theme name has no native member');
  return {theme:out};
 }
 return {dataset,widget,position,theme,scaleFor,names};
}
/** Syncs neutral declarations into native payloads on a copy: edits patch retained members, new items are synthesized. */
function sync(document:Document,issues:LakeviewExportIssue[],render:Render):{document:Document;synthesized:Set<string>}{
 const doc=copyJson(document) as unknown as Document,synthesized=new Set<string>(),root=dash(doc),synth=synthesizer(doc,issues);
 const retained=lv(doc)?.kind==='dashboard';
 let baseline:LakeviewProjection|undefined,view:any;
 if(retained){
  // Reassemble the retained subset exactly, then project it to learn what each neutral item looked like before any edit.
  const probe=copyJson(doc) as unknown as Document;
  for(const m of probe.modules)if(lv(m)?.kind==='page'||lv(m)?.kind==='data'){
   m.elements=m.elements.filter(e=>lv(e));
  }
  probe.modules=probe.modules.filter(m=>lv(m));
  view=JSON.parse(render(probe));baseline=reproject(probe,view).projection;
 } else {
  doc.vocabularies[LV]={version:'0.1.0'};
  doc.extensions=doc.extensions??{};
  const top:any={kind:'dashboard',native:obj({}),order:['datasets','pages']};
  if(root.theme){top.native=toTree({uiSettings:synth.theme(root.theme,'/extensions/umf.dashboard/theme')});top.order.push('uiSettings');}
  doc.extensions[LV]=top as Json;
  if(root.layout.columns!==6&&root.layout.columns!==12)issues.push({code:'LAKEVIEW_EXPORT_ASSUMPTION',path:'/extensions/umf.dashboard/layout',detail:'Grid of '+root.layout.columns+' columns is written as the twelve-column GRID_V1 layout'});
 }
 const twelveRoot=root.layout.columns!==6;
  for(const [mi,module] of doc.modules.entries()){
  const md=dash(module),mpath='/modules/'+mi;if(!md)continue;
  if(md.kind==='data'){
   if(!lv(module))module.extensions![LV]={kind:'data'} as unknown as Json;
   for(const [ei,element] of module.elements.entries()){
    const d=dash(element);if(!d)continue;
    if(lv(element)){const base=baseline?.elements.get(elementKey(module.id,element.id)) as any;
     if(base&&d.title!==base.title)lv(element).native=setIn(lv(element).native,['displayName'],str(d.title));
     continue;}
    element.extensions[LV]={kind:'dataset',native:toTree(synth.dataset(element.id,d,mpath+'/elements/'+ei))} as unknown as Json;synthesized.add(elementKey(module.id,element.id));
   }
  } else if(md.kind==='page'){
   const pageView=lv(module)?(view?.pages?.find((_:any,i:number)=>layoutOf(doc).pages[i]?.id===module.id)):undefined;
   if(!lv(module)){
    const page:any={name:module.id,displayName:md.title,pageType:md.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS'};
    if(twelveRoot)page.layoutVersion='GRID_V1';
    module.extensions![LV]={kind:'page',native:toTree(page),order:[...Object.keys(page),'layout']} as unknown as Json;
    synthesized.add(elementKey(module.id,''));
   } else {
    const base=baseline?.modules.get(module.id) as any;
    if(base&&md.title!==base.title)lv(module).native=setIn(lv(module).native,['displayName'],str(md.title));
    if(base&&md.role!==base.role)lv(module).native=setIn(lv(module).native,['pageType'],str(md.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS'));
   }
   const scale=synth.scaleFor(pageView??{layoutVersion:twelveRoot?'GRID_V1':undefined});
   for(const [ei,element] of module.elements.entries()){
    const d=dash(element);if(!d||!['visual','text','filter'].includes(d.kind))continue;
    const epath=mpath+'/elements/'+ei;
    if(!lv(element)){
     const item={widget:synth.widget(element.id,d,epath),position:synth.position(d.position,scale,epath)};
     element.extensions[LV]={kind:'layout-item',native:toTree(item)} as unknown as Json;synthesized.add(elementKey(module.id,element.id));continue;
    }
    const base=baseline?.elements.get(elementKey(module.id,element.id)) as any;
    if(!base||base.kind!==d.kind)continue;
    let native=lv(element).native as NativeJson;
    const plain:any=nativeToPlain(native);
    if(d.kind!=='text'&&d.title!==base.title)native=setIn(native,['widget','spec','frame','title'],str(d.title));
    if(d.description!==base.description&&typeof d.description==='string')native=setIn(native,['widget','spec','frame','description'],str(d.description));
    if(!eq(d.position,base.position))for(const k of ['x','y','width','height'])if(Number.isInteger(d.position[k]/(k==='x'||k==='width'?scale:1)))native=setIn(native,['position',k],num(d.position[k]/(k==='x'||k==='width'?scale:1)));
    if(d.kind==='text'&&!eq(d.content,base.content)&&d.content.format==='markdown'){
     if(plain.widget?.multilineTextboxSpec)native=setIn(native,['widget','multilineTextboxSpec','lines'],{kind:'array',items:lines(d.content.text).map(str)});
     else if(typeof plain.widget?.textbox_spec==='string')native=setIn(native,['widget','textbox_spec'],str(d.content.text));
    }
    if(d.kind==='filter'&&!eq(d.targets,base.targets)&&d.targets.length===base.targets.length)native=retarget(native,plain,d,base,synth.names);
    lv(element).native=native;
   }
  }
 }
 // Order lists must name every reassembled member that now has content.
 const order:string[]=lv(doc).order;
 if(doc.modules.some(m=>lv(m)?.kind==='data'&&m.elements.some(e=>lv(e)))&&!order.includes('datasets'))order.push('datasets');
 if(doc.modules.some(m=>lv(m)?.kind==='page')&&!order.includes('pages'))order.push('pages');
 for(const m of doc.modules)if(lv(m)?.kind==='page'&&m.elements.some(e=>lv(e)?.kind==='layout-item')&&!lv(m).order.includes('layout'))lv(m).order.push('layout');
 return {document:doc,synthesized};
}
function nativeToPlain(tree:NativeJson):unknown{
 switch(tree.kind){case 'null':return null;case 'number':return Number(tree.value);case 'array':return tree.items.map(nativeToPlain);case 'object':return Object.fromEntries(Object.entries(tree.members).map(([k,v])=>[k,nativeToPlain(v)]));default:return tree.value;}
}
/** Moves a filter target to another column when its query is used by that target alone. */
function retarget(native:NativeJson,plain:any,current:any,base:any,names:Map<string,string>):NativeJson{
 const fields:any[]=plain.widget?.spec?.encodings?.fields??[],queries:any[]=plain.widget?.queries??[];
 for(const [i,target] of current.targets.entries()){
  const was=base.targets[i];if(eq(target,was))continue;
  // Only the field is rewritten; moving a target to another dataset is reported by the final check.
  if(!eq(target.dataset,was.dataset))continue;
  const hits=fields.map((f,k)=>({f,k})).filter(({f})=>{const q=queries.find(q=>q.name===f.queryName),x=q?.query?.fields?.find((x:any)=>x.name===f.fieldName);return x&&x.expression===tick(was.field)&&q.query.datasetName===names.get(JSON.stringify([was.dataset.module,was.dataset.element]));});
  if(hits.length!==1)continue;
  const q=queries.findIndex(q=>q.name===hits[0]!.f.queryName),x=queries[q].query.fields.findIndex((x:any)=>x.name===hits[0]!.f.fieldName);
  if(fields.filter(f=>f.queryName===hits[0]!.f.queryName).length!==1)continue;
  native=setIn(native,['widget','queries',String(q),'query','fields',String(x),'expression'],str(tick(target.field)));
  native=setIn(native,['widget','queries',String(q),'query','fields',String(x),'name'],str(target.field));
  native=setIn(native,['widget','spec','encodings','fields',String(hits[0]!.k),'fieldName'],str(target.field));
 }
 return native;
}
/** Exports a umf.dashboard document to .lvdash.json text, reusing retained native members and synthesizing the rest. */
export function exportNeutralDashboard(document:Document,render:Render):{text:string;issues:LakeviewExportIssue[]}{
 if(dash(document)?.kind!=='dashboard'||document.vocabularies[DASHBOARD_EXTENSION]?.version!=='0.1.0')throw new UmfError('LAKEVIEW_EXPORT_NEUTRAL','Expected umf.dashboard 0.1.0 and a document-level dashboard');
 const checked=inspectDashboard(copyJson(document) as unknown as Document);
 if(!checked.valid)throw new UmfError('LAKEVIEW_EXPORT_NEUTRAL',JSON.stringify(checked.diagnostics.filter(d=>d.severity==='error')));
 const issues:LakeviewExportIssue[]=[],{document:synced,synthesized}=sync(document,issues,render);
 const text=render(synced);
 // Re-project what was written and report every neutral member the native file does not reproduce.
 const {projection,layout}=reproject(synced,JSON.parse(text));
 const originals=copyJson(document) as unknown as Document;
 for(const [mi,module] of originals.modules.entries()){
  const wrote=module.id,mpath='/modules/'+mi,md=dash(module);if(!md)continue;
  const page=projection.modules.get(wrote) as any;
  const fresh=synthesized.has(elementKey(wrote,''));
  if(md.kind==='page'&&page&&(md.title!==page.title||md.role!==page.role))issues.push({path:mpath,code:fresh?'LAKEVIEW_EXPORT_UNSUPPORTED':'LAKEVIEW_EXPORT_UNSYNCED',detail:'Page title or role is not reproduced by the native file'});
  if(md.kind==='page'&&!layout.pages.some(p=>p.id===wrote))issues.push({path:mpath,code:'LAKEVIEW_EXPORT_UNSUPPORTED',detail:'Page was not exported'});
  for(const [ei,element] of module.elements.entries()){
   const d=dash(element);if(!d)continue;
   const found=differences(d,projection.elements.get(elementKey(wrote,element.id)) as any);
   if(!found.length)continue;
   const isNew=synthesized.has(elementKey(wrote,element.id));
   if(found[0]==='(no native counterpart)'&&d.kind==='dataset'){if(isNew)issues.push({path:mpath+'/elements/'+ei,code:'LAKEVIEW_EXPORT_UNSUPPORTED',detail:'Dataset declares no field that an exported item uses; it is exported but will not re-import as a neutral dataset'});continue;}
   issues.push({path:mpath+'/elements/'+ei,code:isNew?'LAKEVIEW_EXPORT_UNSUPPORTED':'LAKEVIEW_EXPORT_UNSYNCED',detail:(isNew?'Not carried by the synthesized widget: ':'Neutral edit not carried; the retained native members are exported unchanged: ')+found.join(', ')});
  }
 }
 const baseRoot=projection.root as any,root=dash(document);
 if(!eq(root.layout,baseRoot.layout)||!eq(root.theme,baseRoot.theme))issues.push({path:'/extensions/umf.dashboard',code:lv(document)?.kind==='dashboard'?'LAKEVIEW_EXPORT_UNSYNCED':'LAKEVIEW_EXPORT_UNSUPPORTED',detail:'Dashboard grid or theme is not reproduced by the native file'+(lv(document)?.kind==='dashboard'?'; the retained settings are exported unchanged':'')});
 return {text,issues};
}
