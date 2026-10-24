// SPDX-License-Identifier: MIT OR Apache-2.0
import {parseNativeJson,renderTree,cloneTree,type NativeJson} from '../../model/native-json';
import type {Document} from '../../model/types';
import {DASHBOARD_EXTENSION} from '../../extensions/dashboard';
import {projectLakeview,elementKey} from './project';
const LAKEVIEW='umf.lakeview';
type Obj=Extract<NativeJson,{kind:'object'}>;
/** What export had to do beyond copying retained native JSON; `path` points into the neutral document. */
export interface LakeviewExportIssue {path:string;code:string;classification:'synthesized'|'assumption'|'loss';detail:string;}
export interface LakeviewExport {text:string;issues:LakeviewExportIssue[];}
const dash=(o:any)=>o?.extensions?.[DASHBOARD_EXTENSION] as any;
const lv=(o:any)=>o?.extensions?.[LAKEVIEW] as any;
const tree=(value:unknown)=>parseNativeJson(JSON.stringify(value));
const obj=(value:unknown)=>tree(value) as Obj;
const canon=(v:any):any=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const same=(a:unknown,b:unknown)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
const lines=(text:string)=>text.match(/[^\n]*\n|[^\n]+/g)??[''];
const quote=(name:string)=>'`'+name.replaceAll('`','``')+'`';
const unquoted=(expression:string)=>/^`((?:[^`]|``)+)`$/.exec(expression)?.[1]?.replaceAll('``','`');
const str=(value:string):NativeJson=>({kind:'string',value});
const member=(node:NativeJson|undefined,key:string):NativeJson|undefined=>node?.kind==='object'?node.members[key]:undefined;
const text=(node:NativeJson|undefined)=>node?.kind==='string'?node.value:undefined;
function child(parent:Obj,key:string):Obj{const n=parent.members[key];if(n?.kind==='object')return n;return parent.members[key]={kind:'object',members:{}};}
const channelKey:Record<string,string>={tooltip:'extra',column:'columns'};
const controlType:Record<string,string>={'single-select':'filter-single-select','multi-select':'filter-multi-select','date-range':'filter-date-range-picker','text-search':'filter-text-entry',range:'filter-range-slider'};
const formatType:Record<string,string>={number:'number',currency:'number-currency',percent:'number-percent'};
const roleKey:Record<string,string>={canvasBackground:'canvasBackgroundColor',widgetBackground:'widgetBackgroundColor',widgetBorder:'widgetBorderColor',font:'fontColor',selection:'selectionColor'};
const specVersion:Record<string,number>={counter:2,table:2};
// Neutral properties each projection rule can carry; anything else has no native member to land in.
const carried:Record<string,string[]>={visual:['kind','title','description','chart','dataset','rows','encodings','position'],filter:['kind','title','description','control','targets','default','position'],text:['kind','content','position'],dataset:['kind','title','source','fields'],page:['kind','title','role']};
class Fallback extends Error {}
interface Context {document:Document;issues:LakeviewExportIssue[];names:Map<string,string>;columns:number;}
const said=(assumed:string[])=>assumed.join('; ')||'no further assumptions';
const note=(ctx:Context,path:string,code:string,classification:LakeviewExportIssue['classification'],detail:string)=>ctx.issues.push({path,code,classification,detail});
/** Builds Lakeview widget JSON for one neutral item; `assumed` collects every choice the neutral declaration did not make. */
function synthesizeItem(item:any,name:string,ctx:Context,assumed:string[]):any{
 const datasetOf=(ref:any)=>ctx.names.get(elementKey(ref.module,ref.element))!;
 const position={x:item.position.x,y:item.position.y,width:item.position.width,height:item.position.height};
 if(item.kind==='text'){
  if(item.content.format==='plain')assumed.push('plain text is exported as a markdown text box');
  return {widget:{name,multilineTextboxSpec:{lines:lines(item.content.text)}},position};
 }
 const frame:any={showTitle:true,title:item.title,...(item.description!==undefined?{showDescription:true,description:item.description}:{})};
 if(item.kind==='filter'){
  const queries:any[]=[],fields:any[]=[];
  item.targets.forEach((t:any,i:number)=>{queries.push({name:'filter_'+i,query:{datasetName:datasetOf(t.dataset),fields:[{name:t.field,expression:quote(t.field)}],disaggregated:false}});fields.push({fieldName:t.field,queryName:'filter_'+i});});
  const spec:any={version:2,widgetType:controlType[item.control]!,encodings:{fields},frame};
  if(item.default){
   const kind=(v:unknown)=>typeof v==='string'?'STRING':typeof v==='boolean'?'BOOLEAN':'DECIMAL';
   spec.selection={defaultSelection:{values:{dataType:kind(item.default.values[0]),values:item.default.values.map((value:unknown)=>({value}))}}};
   assumed.push('default selection data type is inferred from the first value');
  }
  assumed.push('filter query names and the associative-filter helper fields are not generated');
  return {widget:{name,queries,spec},position};
 }
 const fields:{name:string;expression:string}[]=[],taken=new Set<string>();
 const fieldOf=(e:any)=>{
  const c=quote(e.field);let wanted:string,expression:string;
  switch(e.aggregation){
   case 'none':wanted=e.field;expression=c;break;
   case 'measure':wanted='measure('+e.field+')';expression='MEASURE('+c+')';break;
   case 'custom':wanted='custom('+e.field+')';expression=e.expression.text;break;
   case 'count-distinct':wanted='count_distinct('+e.field+')';expression='COUNT(DISTINCT '+c+')';break;
   default:wanted=e.aggregation+'('+e.field+')';expression=e.aggregation.toUpperCase()+'('+c+')';
  }
  const found=fields.find(f=>f.expression===expression);if(found)return found.name;
  let unique=wanted,n=1;while(taken.has(unique))unique=wanted+'_'+(++n);taken.add(unique);fields.push({name:unique,expression});return unique;
 };
 const encodings:Record<string,any>={},groups=new Map<string,any[]>();
 const scaleOf=(e:any,channel:string)=>{
  const scale:any={};if(e.scale)scale.type=e.scale;
  if(e.sort){
   const other=channel==='x'?'y':channel==='y'?'x':undefined,by=e.sort.by,dir=by.endsWith('descending');
   if(by==='custom')scale.sort={by:'custom-order',orderedValues:[...e.sort.values]};
   else if(by.startsWith('label'))scale.sort={by:'natural-order'+(dir?'-reversed':'')};
   else if(other)scale.sort={by:other+(dir?'-reversed':'')};
   else assumed.push('value sort on channel '+channel+' has no native axis to sort by and is omitted');
  }
  return Object.keys(scale).length?{scale}:{};
 };
 const formatOf=(e:any)=>{
  if(!e.format)return {};
  const type=formatType[e.format.kind];if(!type){assumed.push('format kind '+e.format.kind+' has no native form and is omitted');return {};}
  return {format:{type,...(e.format.currency?{currencyCode:e.format.currency}:{}),...(e.format.abbreviation?{abbreviation:e.format.abbreviation}:{}),...(e.format.decimals!==undefined?{decimalPlaces:{type:'exact',places:e.format.decimals}}:{})}};
 };
 for(const e of item.encodings){
  if(e.channel==='detail'){assumed.push('channel detail has no native encoding and is omitted');continue;}
  const key=channelKey[e.channel]??e.channel;groups.set(key,[...(groups.get(key)??[]),e]);
 }
 for(const [key,list] of groups){
  const entry=(e:any)=>({fieldName:fieldOf(e),...(e.title!==undefined?{displayName:e.title}:{}),...(key==='columns'?{visible:true}:{}),...scaleOf(e,key),...formatOf(e)});
  if(key==='columns'||key==='extra'||key==='label'&&list.length>1)encodings[key]=list.map(entry);
  else if(key==='y'&&list.length>1){
   const [first,...rest]=list;if(rest.some(e=>!same(scaleOf(e,key),scaleOf(first,key))||!same(formatOf(e),formatOf(first))))assumed.push('repeated y encodings share the first one\'s scale and format');
   encodings[key]={fields:list.map(e=>({fieldName:fieldOf(e),...(e.title!==undefined?{displayName:e.title}:{})})),...scaleOf(first,key),...formatOf(first)};
  } else encodings[key]=entry(list[0]);
 }
 const spec={version:specVersion[item.chart]??3,widgetType:item.chart,encodings,frame};
 assumed.push('spec version '+spec.version+' and field names are generated');
 return {widget:{name,queries:[{name:'main_query',query:{datasetName:datasetOf(item.dataset),fields:fields.map(f=>({name:f.name,expression:f.expression})),disaggregated:item.rows==='detail'}}],spec},position};
}
function synthesizeDataset(ds:any,name:string,assumed:string[]):any{
 const query=ds.source.kind==='query'?ds.source.query.text:'SELECT * FROM '+ds.source.table;
 if(ds.source.kind==='table')assumed.push('table source '+ds.source.table+' is exported as a SELECT * Databricks SQL query');
 else if(ds.source.query.language!=='databricks-sql')assumed.push('query language '+ds.source.query.language+' is exported unchanged as Databricks SQL');
 const columns=Object.entries<any>(ds.fields).filter(([,f])=>f.role==='measure').map(([displayName,f])=>({displayName,...(f.description!==undefined?{description:f.description}:{}),expression:f.expression.text}));
 return {name,displayName:ds.title,queryLines:lines(query),...(columns.length?{columns}:{})};
}
const pageObject=(page:any,name:string,twelve:boolean)=>({name,displayName:page.title,layout:[] as unknown[],pageType:page.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS',...(twelve?{layoutVersion:'GRID_V1'}:{})});
function uniqueName(taken:Set<string>,wanted:string){let name=wanted,n=1;while(taken.has(name))name=wanted+'_'+(++n);taken.add(name);return name;}
/** Replaces members the neutral edit changed and leaves every other retained token alone; throws Fallback when the edit has no one-to-one native member. */
function patchPage(native:Obj,was:any,now:any){
 if(was.title!==now.title)native.members.displayName=str(now.title);
 if(was.role!==now.role)native.members.pageType=str(now.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS');
}
function patchDataset(native:Obj,was:any,now:any){
 if(was.source.kind!=='query'||now.source.kind!=='query'||was.source.query.language!==now.source.query.language)throw new Fallback();
 if(was.title!==now.title)native.members.displayName=str(now.title);
 if(was.source.query.text!==now.source.query.text){
  if(native.members.queryLines)native.members.queryLines=tree(lines(now.source.query.text));
  else if(native.members.query)native.members.query=str(now.source.query.text);
  else throw new Fallback();
 }
 const measures=(d:any)=>Object.entries<any>(d.fields).filter(([,f])=>f.role==='measure');
 let columns=native.members.columns?.kind==='array'?native.members.columns.items:undefined;
 const named=(name:string)=>columns?.find(c=>text(member(c,'displayName'))===name);
 const nowNames=new Set(measures(now).map(([k])=>k));
 for(const [name,field] of measures(now)){
  const old=was.fields[name],column=named(name);
  if(!old||!column){
   if(old&&!column)throw new Fallback();
   const added=obj({displayName:name,...(field.description!==undefined?{description:field.description}:{}),expression:field.expression.text});
   if(native.members.columns?.kind==='array')native.members.columns.items.push(added);else native.members.columns={kind:'array',items:[added]};
   columns=(native.members.columns as Extract<NativeJson,{kind:'array'}>).items;continue;
  }
  if(!same(old.expression,field.expression)&&column.kind==='object')column.members.expression=str(field.expression.text);
  if(old.description!==field.description&&column.kind==='object'){if(field.description===undefined)delete column.members.description;else column.members.description=str(field.description);}
 }
 for(const [name] of measures(was))if(!nowNames.has(name)&&native.members.columns?.kind==='array')native.members.columns.items=native.members.columns.items.filter(c=>text(member(c,'displayName'))!==name);
 for(const [name,field] of Object.entries<any>(now.fields))if(field.role==='column'&&was.fields[name]?.role!=='column'&&was.fields[name]!==undefined)throw new Fallback();
}
/** Applies a changed visual, filter or text declaration to its retained layout item. */
function patchItem(native:Obj,was:any,now:any,names:Map<string,string>,scale:number,assumed:string[]){
 const widget=native.members.widget;if(widget?.kind!=='object')throw new Fallback();
 const handled=new Set(['position','title','description','targets','content']);
 for(const key of new Set([...Object.keys(was),...Object.keys(now)]))if(!handled.has(key)&&!same(was[key],now[key])&&carried[now.kind]!.includes(key))throw new Fallback();
 if(!same(was.position,now.position)){
  const position=child(native,'position');
  for(const k of ['x','y','width','height'] as const)if(was.position[k]!==now.position[k]){
   const value=(k==='x'||k==='width')?now.position[k]/scale:now.position[k];
   if(!Number.isInteger(value)){assumed.push(k+' '+now.position[k]+' is not a whole number of six-column units and is rounded');}
   position.members[k]={kind:'number',value:String(Math.round(value))};
  }
 }
 if(now.kind==='text'){
  if(was.content.format!==now.content.format)assumed.push('text format change has no native member and is not exported');
  if(was.content.text!==now.content.text){
   const box=member(widget,'multilineTextboxSpec');
   if(box?.kind==='object'&&box.members.lines)box.members.lines=tree(lines(now.content.text));
   else if(widget.members.textbox_spec)widget.members.textbox_spec=str(now.content.text);
   else throw new Fallback();
  }
  return;
 }
 const spec=widget.members.spec;if(spec?.kind!=='object')throw new Fallback();
 if(was.title!==now.title||was.description!==now.description){
  const frame=child(spec,'frame');
  if(was.title!==now.title)frame.members.title=str(now.title);
  if(was.description!==now.description){if(now.description===undefined)delete frame.members.description;else frame.members.description=str(now.description);}
 }
 if(now.kind==='filter'&&!same(was.targets,now.targets))patchTargets(widget,spec,was.targets,now.targets,names);
}
function patchTargets(widget:Obj,spec:Obj,was:any[],now:any[],names:Map<string,string>){
 const queries=widget.members.queries,fields=member(spec.members.encodings,'fields');
 if(was.length!==now.length||queries?.kind!=='array'||fields?.kind!=='array')throw new Fallback();
 // Locate the native query field behind each projected target, in the order the import deduplicates them.
 const slots:{qi:number;fi:number;entries:Obj[];key:string}[]=[];
 for(const entry of fields.items){
  const queryName=text(member(entry,'queryName')),fieldName=text(member(entry,'fieldName'));if(entry.kind!=='object'||queryName===undefined||fieldName===undefined)continue;
  const qi=queries.items.findIndex(q=>text(member(q,'name'))===queryName),query=member(queries.items[qi],'query'),qf=member(query,'fields');
  if(qi<0||qf?.kind!=='array')continue;const fi=qf.items.findIndex(f=>text(member(f,'name'))===fieldName);if(fi<0)continue;
  const column=unquoted(text(member(qf.items[fi],'expression'))??''),dataset=text(member(query,'datasetName'));if(column===undefined||dataset===undefined)continue;
  const key=JSON.stringify([dataset,column]),existing=slots.find(s=>s.key===key);if(existing)existing.entries.push(entry);else slots.push({qi,fi,entries:[entry],key});
 }
 if(slots.length!==was.length)throw new Fallback();
 const assigned=new Map<number,string>();
 now.forEach((target,j)=>{
  if(same(was[j],target))return;
  const slot=slots[j]!,dataset=names.get(elementKey(target.dataset.module,target.dataset.element));if(dataset===undefined)throw new Fallback();
  if(assigned.has(slot.qi)&&assigned.get(slot.qi)!==dataset)throw new Fallback();assigned.set(slot.qi,dataset);
  const query=member(queries.items[slot.qi],'query') as Obj,qf=member(query,'fields') as Extract<NativeJson,{kind:'array'}>,qfield=qf.items[slot.fi] as Obj;
  const oldName=text(qfield.members.name),oldColumn=unquoted(text(qfield.members.expression)!);
  query.members.datasetName=str(dataset);qfield.members.expression=str(quote(target.field));
  // A field named after its column follows the column; any other native name is kept.
  if(oldName===oldColumn){qfield.members.name=str(target.field);for(const entry of slot.entries)entry.members.fieldName=str(target.field);}
 });
}
function patchTheme(view:Obj,was:any,now:any,issues:(detail:string)=>void){
 const settings=child(view,'uiSettings'),theme=child(settings,'theme');
 if(was?.fontFamily!==now?.fontFamily){if(now?.fontFamily===undefined)delete theme.members.fontFamily;else theme.members.fontFamily=str(now.fontFamily);}
 if(!same(was?.palette,now?.palette)){if(now?.palette===undefined)delete theme.members.visualizationColors;else theme.members.visualizationColors=tree(now.palette);}
 for(const [role,key] of Object.entries(roleKey))if(!same(was?.roles?.[role],now?.roles?.[role])){if(now?.roles?.[role]===undefined)delete theme.members[key];else theme.members[key]=tree(now.roles[role]);}
 if(was?.name!==now?.name&&now?.name!==undefined)issues('theme name has no native member');
}
/**
 * Exports an edited umf.dashboard declaration as Lakeview JSON. Where a unit still agrees with what the retained native JSON
 * projects to, its native tokens are reused exactly; an edit that maps to specific native members changes only those members;
 * anything else is built from the neutral declaration and reported.
 */
export function exportNeutralLakeview(document:Document,retainedView?:any):LakeviewExport{
 const root=dash(document),issues:LakeviewExportIssue[]=[],retained=retainedView!==undefined&&lv(document)?.kind==='dashboard';
 const ctx:Context={document,issues,names:new Map(),columns:root.layout.columns};
 const path=(mi:number,ei?:number)=>'/modules/'+mi+(ei===undefined?'':'/elements/'+ei)+'/extensions/'+DASHBOARD_EXTENSION;
 const modules=document.modules.map((module,mi)=>({module,mi}));
 const dataModules=modules.filter(({module})=>dash(module)?.kind==='data');
 const pageById=new Map(modules.filter(({module})=>dash(module)?.kind==='page').map(m=>[m.module.id,m]));
 const pages=[...root.pages as string[]].map(id=>pageById.get(id)!).filter(Boolean);
 // Baseline: what the retained native JSON projects to, so that only real neutral edits are applied.
 const lvData=dataModules.filter(({module})=>lv(module)?.kind==='data'),lvDatasets=lvData.flatMap(({module})=>module.elements.filter(e=>lv(e)?.kind==='dataset').map(e=>({module:module.id,id:e.id})));
 const lvPages=modules.filter(({module})=>lv(module)?.kind==='page');
 const baseline=retained?projectLakeview(retainedView,{data:lvData[0]?.module.id??'data',datasets:lvDatasets.map(d=>d.id),pages:lvPages.map(({module})=>({id:module.id,items:module.elements.filter(e=>lv(e)?.kind==='layout-item').map(e=>e.id)}))},{title:root.title}):undefined;
 const was=(module:string,element:string)=>baseline?.elements.get(elementKey(module,element)) as any;
 // Native dataset names first: widgets refer to them by name.
 const taken=new Set<string>();
 for(const {module} of dataModules)for(const element of module.elements){
  const native=lv(element)?.kind==='dataset'?text(lv(element).native.members.name):undefined;
  ctx.names.set(elementKey(module.id,element.id),uniqueName(taken,native??element.id));
 }
 const datasets:NativeJson[]=[];
 for(const {module,mi} of dataModules)module.elements.forEach((element,ei)=>{
  const now=dash(element),retainedDs=lv(element)?.kind==='dataset',name=ctx.names.get(elementKey(module.id,element.id))!;
  if(!retainedDs){
   if(!now)return;const assumed:string[]=[];datasets.push(tree(synthesizeDataset(now,name,assumed)));
   note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_SYNTHESIZED','synthesized','Dataset built from the neutral declaration; '+said(assumed));return;
  }
  const native=cloneTree(lv(element).native) as Obj,before=was(module.id,element.id);
  if(now&&before&&!same(before,now)){
   const assumed:string[]=[];
   try{patchDataset(native,before,now);}catch(error){
    if(!(error instanceof Fallback))throw error;
    const rebuilt=obj(synthesizeDataset(now,text(native.members.name)??name,assumed));datasets.push(rebuilt);
    note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_SYNTHESIZED','synthesized','Dataset rebuilt from the neutral declaration because the edit has no one-to-one native member; native members not expressed neutrally were replaced; '+said(assumed));return;
   }
  } else if(now&&!before)note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_IGNORED','loss','This dataset has no neutral baseline in its retained native JSON, so the neutral declaration is not exported and the native dataset is kept');
  datasets.push(native);
  for(const key of Object.keys(now??{}))if(!carried.dataset!.includes(key)&&!same(before?.[key],now[key]))note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_DROPPED','loss','Neutral property '+key+' has no native member');
 });
 const twelve=retained?lvPages.some(({module})=>text(member(lv(module).native,'layoutVersion'))!==undefined)||ctx.columns!==6:ctx.columns!==6;
 const outPages:NativeJson[]=[];
 for(const {module,mi} of pages){
  const page=dash(module),retainedPage=lv(module)?.kind==='page';let native:Obj,order:string[]|undefined;
  const legacy=retainedPage&&text(member(lv(module).native,'layoutVersion'))===undefined&&twelve,scale=legacy?2:1;
  const before=retained&&retainedPage?baseline!.modules.get(module.id) as any:undefined;
  if(retainedPage){native=cloneTree(lv(module).native) as Obj;order=lv(module).order;if(before&&!same(before,page))patchPage(native,before,page);}
  else{native=obj(pageObject(page,module.id,twelve));native.members.layout={kind:'array',items:[]};
   note(ctx,path(mi),'LAKEVIEW_EXPORT_SYNTHESIZED','synthesized','Page built from the neutral declaration'+(twelve?'; GRID_V1 is assumed':'; the six-column legacy grid is assumed'));}
  const items:NativeJson[]=[];
  module.elements.forEach((element,ei)=>{
   const now=dash(element),retainedItem=lv(element)?.kind==='layout-item',name=element.id;
   if(retainedItem){
    const item=cloneTree(lv(element).native) as Obj,baseItem=was(module.id,element.id),assumed:string[]=[];
    if(!now||!baseItem||same(baseItem,now)){
     if(now&&!baseItem)note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_IGNORED','loss','This widget has no neutral baseline in its retained native JSON (it was not projected), so the neutral declaration is not exported and the native widget is kept');
     items.push(item);return;
    }
    try{patchItem(item,baseItem,now,ctx.names,scale,assumed);items.push(item);}catch(error){
     if(!(error instanceof Fallback))throw error;
     const widgetName=text(member(member(item,'widget'),'name'))??name,synth=synthesizeItem(now,widgetName,ctx,assumed);
     if(scale===2)for(const k of ['x','width'])synth.position[k]/=2;
     items.push(tree(synth));
     note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_SYNTHESIZED','synthesized','Widget rebuilt from the neutral declaration because the edit has no one-to-one native member; native widget members not expressed neutrally were replaced; '+assumed.join('; '));
    }
    if(assumed.length&&!issues.some(i=>i.path===path(mi,ei)))note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_ASSUMPTION','assumption',assumed.join('; '));
    for(const key of Object.keys(now))if(!carried[now.kind]!.includes(key))note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_DROPPED','loss','Neutral property '+key+' has no native member');
    return;
   }
   if(!now||!['visual','filter','text'].includes(now.kind))return;
   const assumed:string[]=[],synth=synthesizeItem(now,name,ctx,assumed);items.push(tree(synth));
   note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_SYNTHESIZED','synthesized','Widget built from the neutral declaration; '+said(assumed));
   for(const key of Object.keys(now))if(!carried[now.kind]!.includes(key))note(ctx,path(mi,ei),'LAKEVIEW_EXPORT_DROPPED','loss','Neutral property '+key+' has no native member');
  });
  native.members.layout={kind:'array',items};
  if(order&&!order.includes('layout')&&items.length)order=[...order,'layout'];
  if(order){const members=Object.fromEntries(order.filter(k=>Object.hasOwn(native.members,k)).map(k=>[k,native.members[k]!]));native.members=members;}
  outPages.push(native);
  for(const key of Object.keys(page))if(!carried.page!.includes(key))note(ctx,path(mi),'LAKEVIEW_EXPORT_DROPPED','loss','Neutral property '+key+' has no native member');
 }
 let out:Obj;
 if(retained){
  out=cloneTree(lv(document).native) as Obj;const order=[...lv(document).order as string[]];
  for(const key of ['datasets','pages'])if(!order.includes(key)&&(key==='datasets'?datasets:outPages).length)order.push(key);
  out.members.datasets={kind:'array',items:datasets};out.members.pages={kind:'array',items:outPages};
  const view=out,wasTheme=baseline!.root as any;
  if(!same(wasTheme.theme,root.theme))patchTheme(view,wasTheme.theme,root.theme,detail=>note(ctx,'/extensions/'+DASHBOARD_EXTENSION+'/theme','LAKEVIEW_EXPORT_DROPPED','loss',detail));
  const members=Object.fromEntries([...order,...(view.members.uiSettings&&!order.includes('uiSettings')?['uiSettings']:[])].filter(k=>Object.hasOwn(view.members,k)).map(k=>[k,view.members[k]!]));out.members=members;
  if(wasTheme.layout.columns!==ctx.columns)note(ctx,'/extensions/'+DASHBOARD_EXTENSION+'/layout','LAKEVIEW_EXPORT_IGNORED','loss','The column count is not exported; each native page keeps its own grid version');
 } else {
  out={kind:'object',members:{datasets:{kind:'array',items:datasets},pages:{kind:'array',items:outPages}}};
  if(root.theme){
   patchTheme(out,undefined,root.theme,detail=>note(ctx,'/extensions/'+DASHBOARD_EXTENSION+'/theme','LAKEVIEW_EXPORT_DROPPED','loss',detail));
  }
  if(ctx.columns!==6&&ctx.columns!==12)note(ctx,'/extensions/'+DASHBOARD_EXTENSION+'/layout','LAKEVIEW_EXPORT_ASSUMPTION','assumption','Lakeview grids have six or twelve columns; '+ctx.columns+' columns are exported as GRID_V1 positions unchanged');
 }
 for(const key of Object.keys(root))if(!['kind','title','pages','layout','theme'].includes(key))note(ctx,'/extensions/'+DASHBOARD_EXTENSION,'LAKEVIEW_EXPORT_DROPPED','loss','Neutral property '+key+' has no native member');
 return {text:renderTree(out),issues};
}
