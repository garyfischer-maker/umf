// SPDX-License-Identifier: MIT OR Apache-2.0
import {renderTree,cloneTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json} from '../../model/types';
import {DASHBOARD_EXTENSION,inspectDashboard} from '../../extensions/dashboard';
import {LAKEVIEW_EXTENSION,inspectLakeview,exportLakeviewDashboard,type LakeviewIssue} from './index';
import {projectLakeview,elementKey} from './project';
type ObjectTree=Extract<NativeJson,{kind:'object'}>;
export type LakeviewExportMode='retained'|'patched'|'synthesized';
export interface LakeviewExport {text:string;issues:LakeviewIssue[];elements:{module:string;element?:string;mode:LakeviewExportMode;changed?:string[]}[];}
const SQL='databricks-sql';
const lv=(owner:{extensions?:Record<string,Json>}|undefined)=>owner?.extensions?.[LAKEVIEW_EXTENSION] as any;
const dash=(owner:{extensions?:Record<string,Json>}|undefined)=>owner?.extensions?.[DASHBOARD_EXTENSION] as any;
const controls:Record<string,string>={'single-select':'filter-single-select','multi-select':'filter-multi-select','date-range':'filter-date-range-picker','text-search':'filter-text-entry','range':'filter-range-slider'};
const versions:Record<string,number>={counter:2,table:2};
const channels:Record<string,string>={x:'x',y:'y',color:'color',size:'size',label:'label',value:'value',target:'target',angle:'angle',tooltip:'extra',column:'columns'};
const functions:Record<string,string>={sum:'SUM',avg:'AVG',min:'MIN',max:'MAX',count:'COUNT'};
const roles:Record<string,string>={canvasBackground:'canvasBackgroundColor',widgetBackground:'widgetBackgroundColor',widgetBorder:'widgetBorderColor',font:'fontColor',selection:'selectionColor'};
const themeKeys=['fontFamily','visualizationColors',...Object.values(roles)];
const handled:Record<string,string[]>={dataset:['kind','title','source','fields'],visual:['kind','title','description','chart','dataset','rows','encodings','position','trace'],text:['kind','content','position','trace'],filter:['kind','title','description','control','targets','default','position','trace'],page:['kind','title','role'],dashboard:['kind','title','pages','layout','theme']};
const patchable:Record<string,string[]>={visual:['title','description','position'],filter:['title','description','position','targets'],text:['content','position'],dataset:['title'],page:['title','role']};
const quote=(name:string)=>'`'+name.replaceAll('`','``')+'`';
const lines=(text:string)=>text.split(/(?<=\n)/);
/** Builds a native tree from plain JSON, keeping member order. */
const tree=(value:unknown):NativeJson=>value===null?{kind:'null'}:Array.isArray(value)?{kind:'array',items:value.map(tree)}:typeof value==='object'?{kind:'object',members:Object.fromEntries(Object.entries(value as object).filter(([,v])=>v!==undefined).map(([k,v])=>[k,tree(v)]))}:typeof value==='number'?{kind:'number',value:String(value)}:typeof value==='boolean'?{kind:'boolean',value}:{kind:'string',value:String(value)};
const stable=(value:any):string=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}':JSON.stringify(value);
const same=(a:unknown,b:unknown)=>stable(a)===stable(b);
const obj=(node:NativeJson|undefined):ObjectTree|undefined=>node?.kind==='object'?node:undefined;
const str=(node:NativeJson|undefined)=>node?.kind==='string'?node.value:undefined;
const changedKeys=(before:any,after:any)=>[...new Set([...Object.keys(before??{}),...Object.keys(after??{})])].filter(k=>!same(before?.[k],after?.[k]));
/**
 * Exports a umf.dashboard declaration to a .lvdash.json. Items whose neutral declaration still equals what the importer
 * would project from their retained umf.lakeview payload keep that payload token for token; edited neutral members are
 * written into only the matching native members; anything else is synthesized and each assumption is reported.
 */
export function exportNeutralDashboard(document:Document):LakeviewExport {
 const issues:LakeviewIssue[]=[],elements:LakeviewExport['elements']=[];
 const note=(path:string,code:string,classification:LakeviewIssue['classification'],detail:string)=>issues.push({path,code,classification,detail,retainedInSource:true});
 const root=dash(document);
 if(root?.kind!=='dashboard')throw new UmfError('LAKEVIEW_EXPORT','Expected a document-level umf.dashboard declaration');
 const checked=inspectDashboard(document);
 if(!checked.valid)throw new UmfError('LAKEVIEW_EXPORT',JSON.stringify(checked.diagnostics.filter(d=>d.severity==='error')));
 const retained=lv(document)?.kind==='dashboard';
 let baseline:ReturnType<typeof projectLakeview>|undefined;
 if(retained){
  const valid=inspectLakeview(document);
  if(!valid.valid)throw new UmfError('LAKEVIEW_DOCUMENT',JSON.stringify(valid.diagnostics.filter(d=>d.severity==='error')));
  if(valid.diagnostics.some(d=>d.code==='LAKEVIEW_REPRESENTATION'))throw new UmfError('LAKEVIEW_EXPORT','Unknown representation fields cannot be discarded');
  // What the importer would project from the retained native content alone; differences from it are the edits.
  const dataModule=document.modules.find(m=>lv(m)?.kind==='data'),pageModules=document.modules.filter(m=>lv(m)?.kind==='page');
  const ids={data:dataModule?.id??'data',datasets:(dataModule?.elements??[]).filter(e=>lv(e)?.kind==='dataset').map(e=>e.id),pages:pageModules.map(m=>({id:m.id,items:m.elements.filter(e=>lv(e)?.kind==='layout-item').map(e=>e.id)}))};
  baseline=projectLakeview(JSON.parse(exportLakeviewDashboard(document)),ids,{title:root.title});
 }
 const base=(module:string,element?:string)=>element===undefined?baseline?.modules.get(module):baseline?.elements.get(elementKey(module,element));
 // Native names of datasets, which widget queries refer to.
 const datasetName=new Map<string,string>();
 for(const m of document.modules)for(const e of m.elements)if(dash(e)?.kind==='dataset'||lv(e)?.kind==='dataset')datasetName.set(elementKey(m.id,e.id),str(obj(lv(e)?.native)?.members.name)??e.id);
 const nameOf=(ref:{module:string;element:string})=>datasetName.get(elementKey(ref.module,ref.element))??ref.element;
 const unmapped=(kind:string,value:any,path:string)=>{for(const key of Object.keys(value))if(!handled[kind]!.includes(key))note(path,'LAKEVIEW_EXPORT_UNMAPPED','unsupported','Neutral member '+JSON.stringify(key)+' has no Lakeview form and is not exported');};
 const grid=root.layout?.columns as number;
 const fit=(path:string,position:any,scale:number)=>{
  const out:Record<string,number>={};
  for(const k of ['x','y','width','height']){const v=(k==='x'||k==='width'?position[k]*12/grid:position[k])/scale;out[k]=Number.isInteger(v)?v:Math.round(v);if(out[k]!==v)note(path+'/position/'+k,'LAKEVIEW_GRID','representation-change','Position '+position[k]+' does not divide evenly into the native grid and was rounded to '+out[k]);}
  return out;
 };
 const twelve=grid!==6;
 // ---- synthesis from the neutral declaration ----
 function synthDataset(id:string,d:any,path:string):NativeJson {
  unmapped('dataset',d,path);
  let text:string;
  if(d.source.kind==='query'){text=d.source.query.text;if(d.source.query.language!==SQL)note(path+'/queryLines','LAKEVIEW_QUERY_LANGUAGE','representation-change','Query language '+JSON.stringify(d.source.query.language)+' is written verbatim as Databricks SQL');}
  else {text='SELECT * FROM '+d.source.table;note(path+'/queryLines','LAKEVIEW_EXPORT_ASSUMED','representation-change','Table source '+JSON.stringify(d.source.table)+' is exported as SELECT * FROM the table');}
  const columns=Object.entries<any>(d.fields).filter(([,f])=>f.role==='measure'&&f.expression).map(([name,f])=>{
   if(f.expression.language!==SQL)note(path+'/columns','LAKEVIEW_QUERY_LANGUAGE','representation-change','Measure '+JSON.stringify(name)+' expression language '+JSON.stringify(f.expression.language)+' is written verbatim as Databricks SQL');
   return {displayName:name,...(f.description!==undefined?{description:f.description}:{}),expression:f.expression.text};
  });
  for(const [name,f] of Object.entries<any>(d.fields))for(const key of ['type','title'])if(f[key]!==undefined)note(path+'/columns','LAKEVIEW_STYLE','annotation-only','Field '+JSON.stringify(name)+' '+key+' is not declared natively');
  return tree({name:id,displayName:d.title,queryLines:lines(text),...(columns.length?{columns}:{})});
 }
 function synthWidget(id:string,d:any,path:string,scale:number):NativeJson {
  unmapped(d.kind,d,path);
  if(d.trace!==undefined)note(path,'LAKEVIEW_EXPORT_UNMAPPED','annotation-only','Trace '+JSON.stringify(d.trace)+' has no Lakeview form and is not exported');
  const position=fit(path,d.position,scale);
  if(d.kind==='text'){
   if(d.content.format==='plain')note(path+'/widget/multilineTextboxSpec','LAKEVIEW_EXPORT_ASSUMED','representation-change','Plain text is written as markdown');
   return tree({widget:{name:id,multilineTextboxSpec:{lines:lines(d.content.text)}},position});
  }
  const frame={showTitle:true,title:d.title,...(d.description!==undefined?{showDescription:true,description:d.description}:{})};
  if(d.kind==='filter'){
   const queries:any[]=[],fields:any[]=[],names=new Set<string>();
   for(const t of d.targets){let name='q_'+id+'_'+nameOf(t.dataset),n=1;while(names.has(name))name+='_'+(++n);names.add(name);queries.push({name,query:{datasetName:nameOf(t.dataset),fields:[{name:t.field,expression:quote(t.field)}],disaggregated:false}});fields.push({fieldName:t.field,displayName:d.title,queryName:name});}
   const spec:any={version:2,widgetType:controls[d.control],encodings:{fields},frame};
   if(d.default){
    const type=typeof d.default.values[0],dataType=type==='number'?'DECIMAL':type==='boolean'?'BOOLEAN':'STRING';
    spec.selection={defaultSelection:{values:{dataType,values:d.default.values.map((value:unknown)=>({value}))}}};
    note(path+'/widget/spec/selection','LAKEVIEW_EXPORT_ASSUMED','representation-change','Default selection data type '+dataType+' is inferred from the neutral values');
   }
   return tree({widget:{name:id,queries,spec},position});
  }
  const names=new Map<string,any>(),encodings:Record<string,any>={},table:any[]=[];
  for(const [i,e] of d.encodings.entries()){
   const ep=path+'/widget/spec/encodings/'+i;let name:string,expression:string;
   if(e.aggregation==='none'){name=e.field;expression=quote(e.field);}
   else if(e.aggregation==='measure'){name='measure('+e.field+')';expression='MEASURE('+quote(e.field)+')';}
   else if(e.aggregation==='count-distinct'){name='countdistinct('+e.field+')';expression='COUNT(DISTINCT '+quote(e.field)+')';}
   else if(e.aggregation==='custom'){name=expression=e.expression.text;if(e.expression.language!==SQL)note(ep,'LAKEVIEW_QUERY_LANGUAGE','representation-change','Expression language '+JSON.stringify(e.expression.language)+' is written verbatim as Databricks SQL');}
   else {name=e.aggregation+'('+e.field+')';expression=functions[e.aggregation]+'('+quote(e.field)+')';}
   names.set(name,{name,expression});
   const channel=channels[e.channel];
   if(!channel){note(ep,'LAKEVIEW_EXPORT_UNMAPPED','unsupported','Channel '+JSON.stringify(e.channel)+' has no Lakeview encoding; the field is not exported as an encoding');continue;}
   const native:any={fieldName:name,...(e.title!==undefined?{displayName:e.title}:{})};
   const scale:any={};if(e.scale)scale.type=e.scale;
   if(e.sort){
    const descending=e.sort.by.endsWith('descending');
    if(e.sort.by==='custom')scale.sort={by:'custom-order',orderedValues:e.sort.values??[]};
    else if(e.sort.by.startsWith('label'))scale.sort={by:'natural-order'+(descending?'-reversed':'')};
    else if(e.channel==='x'||e.channel==='y')scale.sort={by:(e.channel==='x'?'y':'x')+(descending?'-reversed':'')};
    else note(ep+'/sort','LAKEVIEW_EXPORT_UNMAPPED','unsupported','Value sort on channel '+e.channel+' has no Lakeview form and is not exported');
   }
   if(Object.keys(scale).length)native.scale=scale;
   if(e.format){
    if(e.format.kind==='date')note(ep+'/format','LAKEVIEW_EXPORT_UNMAPPED','unsupported','Date format has no declared Lakeview form and is not exported');
    else native.format={type:e.format.kind==='currency'?'number-currency':e.format.kind==='percent'?'number-percent':'number',...(e.format.currency!==undefined?{currencyCode:e.format.currency}:{}),...(e.format.abbreviation!==undefined?{abbreviation:e.format.abbreviation}:{}),...(e.format.decimals!==undefined?{decimalPlaces:{type:'exact',places:e.format.decimals}}:{})};
   }
   if(channel==='columns')table.push(native);else if(!encodings[channel])encodings[channel]=native;else encodings[channel]=[].concat(encodings[channel],native as never);
  }
  if(table.length)encodings.columns=table;
  const spec={version:versions[d.chart]??3,widgetType:d.chart,encodings,frame};
  note(path+'/widget/spec/version','LAKEVIEW_EXPORT_ASSUMED','representation-change','Widget spec version '+spec.version+' is assumed for '+d.chart);
  return tree({widget:{name:id,queries:[{name:'main_query',query:{datasetName:nameOf(d.dataset),fields:[...names.values()],disaggregated:d.rows==='detail'}}],spec},position});
 }
 // ---- targeted patches of retained native content ----
 function patchWidget(item:ObjectTree,d:any,b:any,keys:string[],path:string,scale:number):void {
  const widget=obj(item.members.widget)!,spec=obj(widget.members.spec);
  const frame=()=>{if(!spec)throw new UmfError('LAKEVIEW_EXPORT','Widget has no spec to carry its title');return obj(spec.members.frame)??(spec.members.frame=tree({}) as ObjectTree)as ObjectTree;};
  for(const key of keys){
   if(key==='title')frame().members.title=tree(d.title);
   else if(key==='description'){if(d.description===undefined)delete frame().members.description;else frame().members.description=tree(d.description);}
   else if(key==='position'){const out=fit(path,d.position,scale),position=obj(item.members.position)!;for(const k of Object.keys(out))if(!same(d.position[k],b?.position?.[k])||b===undefined)position.members[k]=tree(out[k]);}
   else if(key==='content'){
    const box=obj(widget.members.multilineTextboxSpec);
    if(box)box.members.lines=tree(lines(d.content.text));else widget.members.textbox_spec=tree(d.content.text);
   }
   else if(key==='targets')patchTargets(widget,d,path);
  }
 }
 function patchTargets(widget:ObjectTree,d:any,path:string):void {
  const spec=obj(widget.members.spec)!,encodings=obj(spec.members.encodings)!,fields=encodings.members.fields,queries=widget.members.queries;
  if(fields?.kind!=='array'||queries?.kind!=='array')throw new UmfError('LAKEVIEW_EXPORT','Filter widget has no query list to retarget');
  const wanted=d.targets.map((t:any)=>({key:JSON.stringify([nameOf(t.dataset),t.field]),t}));
  // A field entry belongs to a target when its query reads one plain column of one dataset.
  const owner=(entry:NativeJson)=>{
   const e=obj(entry),f=str(e?.members.fieldName),q=obj(queries.items.find(c=>str(obj(c)?.members.name)===str(e?.members.queryName))),query=obj(q?.members.query),list=query?.members.fields;
   const own=list?.kind==='array'?list.items.find(x=>str(obj(x)?.members.name)===f):undefined,ds=str(query?.members.datasetName);
   return ds!==undefined&&f!==undefined&&str(obj(own)?.members.expression)===quote(f)?JSON.stringify([ds,f]):undefined;
  };
  const keep:NativeJson[]=[],seen=new Set<string>();
  for(const entry of fields.items){const k=owner(entry);if(k===undefined||(wanted.some((w:any)=>w.key===k)&&!seen.has(k))){keep.push(entry);if(k)seen.add(k);}}
  const names=new Set(queries.items.map(q=>str(obj(q)?.members.name)));
  const queryList=[...queries.items];
  const used=new Set(keep.map(e=>str(obj(e)?.members.queryName)));
  const id=str(widget.members.name)??'widget';
  for(const w of wanted)if(!seen.has(w.key)){
   let name='q_'+id+'_'+nameOf(w.t.dataset),n=1;while(names.has(name))name+='_'+(++n);names.add(name);used.add(name);
   queryList.push(tree({name,query:{datasetName:nameOf(w.t.dataset),fields:[{name:w.t.field,expression:quote(w.t.field)}],disaggregated:false}}));
   const title=str(obj(spec.members.frame)?.members.title)??d.title;
   keep.push(tree({fieldName:w.t.field,displayName:title,queryName:name}));
   note(path+'/widget/queries','LAKEVIEW_EXPORT_ASSUMED','representation-change','Target '+JSON.stringify(w.t.field)+' on dataset '+JSON.stringify(nameOf(w.t.dataset))+' is a new filter query; its display name follows the filter title');
  }
  encodings.members.fields={kind:'array',items:keep};
  widget.members.queries={kind:'array',items:queryList.filter(q=>used.has(str(obj(q)?.members.name))||!fields.items.some(e=>str(obj(e)?.members.queryName)===str(obj(q)?.members.name)))};
 }
 function exportElement(module:Document['modules'][number],e:Document['modules'][number]['elements'][number],kind:'dataset'|'widget',path:string,scale:number):NativeJson|undefined {
  const cur=dash(e),native=lv(e)?.native as ObjectTree|undefined,b=base(module.id,e.id),at={module:module.id,element:e.id};
  if(!native){
   if(!cur){note(path,'LAKEVIEW_EXPORT_UNMAPPED','unsupported','Element '+JSON.stringify(e.id)+' has neither a dashboard declaration nor native content and is not exported');return undefined;}
   elements.push({...at,mode:'synthesized'});
   return kind==='dataset'?synthDataset(e.id,cur,path):synthWidget(e.id,cur,path,scale);
  }
  // A neutral declaration the importer omitted (profile rejection) stays omitted; the native content is exported as it was.
  if(!cur||same(cur,b)){elements.push({...at,mode:'retained'});return cloneTree(native);}
  const keys=changedKeys(b,cur),inert=keys.filter(k=>!(patchable[cur.kind]??[]).includes(k)),structural=inert.filter(k=>k!=='trace');
  if(b===undefined||structural.length){
   elements.push({...at,mode:'synthesized',changed:keys});
   note(path,'LAKEVIEW_EXPORT_RESYNTHESIZED','representation-change','Neutral members '+keys.join(', ')+' changed beyond what can be written into the retained native content; the item is rebuilt from the neutral declaration and native-only members (styling, widget filters, parameters) are not carried');
   return kind==='dataset'?synthDataset(e.id,cur,path):synthWidget(e.id,cur,path,scale);
  }
  for(const k of inert)note(path,'LAKEVIEW_EXPORT_UNMAPPED','annotation-only','Neutral member '+JSON.stringify(k)+' changed but has no Lakeview form; the native content is unchanged');
  const copy=cloneTree(native) as ObjectTree,patch=keys.filter(k=>!inert.includes(k));
  if(kind==='dataset'){if(patch.includes('title'))copy.members.displayName=tree(cur.title);}
  else patchWidget(copy,cur,b,patch,path,scale);
  elements.push({...at,mode:'patched',changed:patch});
  return copy;
 }
 // ---- assembly ----
 const datasets:NativeJson[]=[],pages:NativeJson[]=[];
 const anyTwelve=document.modules.some(m=>obj(lv(m)?.native)?.members.layoutVersion!==undefined);
 for(const module of document.modules){
  const d=dash(module),kind=d?.kind??lv(module)?.kind;
  if(kind==='data'){
   for(const e of module.elements){const out=exportElement(module,e,'dataset','/datasets/'+datasets.length,1);if(out)datasets.push(out);}
   continue;
  }
  if(kind!=='page'){note('','LAKEVIEW_EXPORT_UNMAPPED','unsupported','Module '+JSON.stringify(module.id)+' is neither a dashboard data nor page module and is not exported');continue;}
  const path='/pages/'+pages.length,items:NativeJson[]=[],payload=lv(module),legacy=payload&&anyTwelve&&obj(payload.native)?.members.layoutVersion===undefined;
  const scale=legacy?2:1;
  for(const e of module.elements){const out=exportElement(module,e,'widget',path+'/layout/'+items.length,payload?scale:1);if(out)items.push(out);}
  const layout:NativeJson={kind:'array',items};
  if(!payload){
   unmapped('page',d,path);
   elements.push({module:module.id,mode:'synthesized'});
   pages.push(tree({name:module.id,displayName:d.title,pageType:d.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS'}));
   const page=pages.at(-1) as ObjectTree;page.members.layout=layout;if(twelve)page.members.layoutVersion=tree('GRID_V1');
   continue;
  }
  const page=cloneTree(payload.native) as ObjectTree,b=base(module.id) as any,keys=d&&b?changedKeys(b,d):[];
  for(const k of keys){
   if(k==='title')page.members.displayName=tree(d.title);
   else if(k==='role')page.members.pageType=tree(d.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS');
   else note(path,'LAKEVIEW_EXPORT_UNMAPPED','annotation-only','Neutral page member '+JSON.stringify(k)+' has no Lakeview form and is not exported');
  }
  elements.push({module:module.id,mode:keys.length?'patched':'retained',...(keys.length?{changed:keys}:{})});
  const members:Record<string,NativeJson>={};
  for(const key of payload.order as string[])members[key]=key==='layout'?layout:page.members[key]!;
  if(!('layout' in members)&&items.length)members.layout=layout;
  pages.push({kind:'object',members});
 }
 // ---- dashboard-level members ----
 const b=baseline?.root as any,top=changedKeys(b,root);
 const theme=(t:any)=>{
  const out:Record<string,unknown>={};
  if(t.fontFamily!==undefined)out.fontFamily=t.fontFamily;
  if(t.palette!==undefined)out.visualizationColors=t.palette;
  for(const [role,value] of Object.entries<any>(t.roles??{}))out[roles[role]!]=value;
  if(t.name!==undefined)note('/uiSettings/theme','LAKEVIEW_STYLE','annotation-only','Theme name '+JSON.stringify(t.name)+' is not declared natively');
  return out;
 };
 const parts=(items:NativeJson[])=>({kind:'array',items}) as NativeJson;
 let members:Record<string,NativeJson>;
 if(retained){
  const payload=lv(document),native=cloneTree(payload.native) as ObjectTree;
  if(top.includes('theme')){
   const ui=obj(native.members.uiSettings)??(native.members.uiSettings=tree({}) as ObjectTree)as ObjectTree,t=obj(ui.members.theme)??(ui.members.theme=tree({}) as ObjectTree)as ObjectTree;
   const now=theme(root.theme??{}),before=b?.theme?theme(b.theme):{};
   for(const key of themeKeys){if(key in now)t.members[key]=tree(now[key]);else if(key in before)delete t.members[key];}
  }
  for(const k of top)if(k==='layout')note('','LAKEVIEW_EXPORT_UNMAPPED','annotation-only','Neutral dashboard member '+JSON.stringify(k)+' has no Lakeview form; the native content is unchanged');
  members={};
  for(const key of payload.order as string[])members[key]=key==='datasets'?parts(datasets):key==='pages'?parts(pages):native.members[key]!;
  if(!('datasets' in members)&&datasets.length)members.datasets=parts(datasets);
  if(!('pages' in members)&&pages.length)members.pages=parts(pages);
  elements.push({module:'',mode:top.length?'patched':'retained',...(top.length?{changed:top}:{})});
 } else {
  unmapped('dashboard',root,'');
  note('','LAKEVIEW_EXPORT_UNMAPPED','unsupported','Dashboard title '+JSON.stringify(root.title)+' is not part of a .lvdash.json; it is not exported');
  members={datasets:parts(datasets),pages:parts(pages)};
  if(root.theme)members.uiSettings=tree({theme:theme(root.theme)});
  elements.push({module:'',mode:'synthesized'});
 }
 return {text:renderTree({kind:'object',members}),issues,elements};
}
