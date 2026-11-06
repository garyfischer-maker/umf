// SPDX-License-Identifier: MIT OR Apache-2.0
import {renderTree,cloneTree,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Diagnostic} from '../../model/types';
import type {ProjectionIssue} from '../../projections/json-schema-protobuf';
import {projectLakeview,elementKey,controls,channels,roles,formats,type LakeviewProjection} from './project';
const LV='umf.lakeview',DB='umf.dashboard';
type Obj=Extract<NativeJson,{kind:'object'}>;
/** `path` is a JSON Pointer into the exported file; `detail` names what was assumed, dropped or not expressed. */
export interface LakeviewExportIssue {path:string;code:string;classification:ProjectionIssue['classification'];detail:string;}
export interface LakeviewExport {text:string;issues:LakeviewExportIssue[];}
interface Unit {id:string;current?:any;native?:Obj|undefined;mode:'native'|'synth';resynth?:Obj;}
interface PageUnit extends Unit {order?:string[];items:Unit[];}
const tree=(v:any):NativeJson=>{
 if(v===null)return {kind:'null'};
 if(typeof v==='boolean')return {kind:'boolean',value:v};
 if(typeof v==='string')return {kind:'string',value:v};
 if(typeof v==='number'){if(!Number.isFinite(v))throw new UmfError('LAKEVIEW_EXPORT','Non-finite number cannot be exported');return {kind:'number',value:String(v)};}
 if(Array.isArray(v))return {kind:'array',items:v.map(tree)};
 return {kind:'object',members:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,tree(x)]))};
};
const canon=(v:unknown)=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0)):x);
const same=(a:unknown,b:unknown)=>canon(a)===canon(b);
const diff=(a:any,b:any,path=''):string[]=>{
 if(same(a,b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],path+'/'+pointer(k)));
 return [path];
};
// Native members present in the replaced fragment and absent from its replacement.
const lost=(old:NativeJson,neu:NativeJson|undefined,path=''):string[]=>{
 if(old.kind==='object')return Object.entries(old.members).flatMap(([k,v])=>neu?.kind==='object'&&Object.hasOwn(neu.members,k)?lost(v,neu.members[k],path+'/'+pointer(k)):[path+'/'+pointer(k)]);
 if(old.kind==='array')return old.items.flatMap((v,i)=>lost(v,neu?.kind==='array'?neu.items[i]:undefined,path+'/'+i));
 return [];
};
const quote=(n:string)=>'`'+n.replaceAll('`','``')+'`';
const unquote=(e:string)=>{const m=/^`((?:[^`]|``)+)`$/.exec(e);return m?m[1]!.replaceAll('``','`'):undefined;};
const member=(o:NativeJson|undefined,k:string):NativeJson|undefined=>o?.kind==='object'&&Object.hasOwn(o.members,k)?o.members[k]:undefined;
const objOf=(n:NativeJson|undefined):Obj|undefined=>n?.kind==='object'?n:undefined;
const text=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
const ensure=(o:Obj,k:string):Obj=>objOf(o.members[k])??(o.members[k]={kind:'object',members:{}} as Obj) as Obj;
const lines=(t:string)=>t.split(/(?<=\n)/);
const assemble=(native:Obj|undefined,order:string[],parts:Record<string,NativeJson>):Obj=>({kind:'object',members:Object.fromEntries([...order,...Object.keys(parts).filter(k=>!order.includes(k))].flatMap(k=>{const v=Object.hasOwn(parts,k)?parts[k]:native?.members[k];return v?[[k,v]]:[];}))});
const lv=(o:{extensions?:Record<string,any>}|undefined)=>o?.extensions?.[LV];
const db=(o:{extensions?:Record<string,any>}|undefined)=>o?.extensions?.[DB];
const kindOf=(o:{extensions?:Record<string,any>}|undefined)=>db(o)?.kind??lv(o)?.kind;
const channelKeys=Object.fromEntries(Object.entries(channels).map(([k,v])=>[v,k]));
const controlKeys=Object.fromEntries(Object.entries(controls).map(([k,v])=>[v,k]));
const roleKeys=Object.fromEntries(Object.entries(roles).map(([k,v])=>[v,k]));
const formatKeys:Record<string,string>={number:'number',currency:'number-currency',percent:'number-percent'};
const aggregates:Record<string,string>={sum:'SUM',avg:'AVG',min:'MIN',max:'MAX',count:'COUNT'};
const versions:Record<string,number>={counter:2,table:2};
const SQL='databricks-sql';
/**
 * Exports a umf.dashboard declaration to .lvdash.json. Items whose neutral declaration still equals what the importer would
 * project from their retained umf.lakeview JSON keep that JSON exactly; edits to title, description, text, position, filter
 * targets, filter default values, page titles and roles, dataset queries and measures, and theme colors and font are patched
 * into the retained members; anything else is synthesized from the neutral declaration. Every synthesis and every neutral
 * member the result does not reproduce is reported.
 */
export function exportDashboardFromNeutral(document:Document,inspect:(document:Document)=>{valid:boolean;diagnostics:Diagnostic[]}):LakeviewExport{
 const checked=inspect(document);
 if(!checked.valid)throw new UmfError('LAKEVIEW_DOCUMENT',JSON.stringify(checked.diagnostics.filter(d=>d.severity==='error')));
 if(checked.diagnostics.some(d=>d.code==='LAKEVIEW_REPRESENTATION'))throw new UmfError('LAKEVIEW_EXPORT','Unknown representation fields cannot be discarded');
 const root=db(document);
 if(document.vocabularies[DB]?.version!=='0.1.0'||root?.kind!=='dashboard')throw new UmfError('LAKEVIEW_EXPORT','Expected umf.dashboard 0.1.0 and a document-level dashboard');
 const lvRoot=lv(document);
 if(lvRoot&&(document.vocabularies[LV]?.version!=='0.1.0'||lvRoot.kind!=='dashboard'))throw new UmfError('LAKEVIEW_PAYLOAD','Expected umf.lakeview 0.1.0 and a document-level dashboard');
 const unit=(e:{id:string;extensions:Record<string,any>}):Unit|undefined=>{const native=e.extensions[LV]?.native as Obj|undefined,current=e.extensions[DB];return native||current?{id:e.id,current,native:native&&cloneTree(native) as Obj,mode:native?'native':'synth'}:undefined;};
 const dataModules=document.modules.filter(m=>kindOf(m)==='data');
 const datasets=dataModules.flatMap(m=>m.elements.map(unit).filter((u):u is Unit=>!!u)),dataId=dataModules[0]?.id??'data';
 const rank=(id:string)=>Array.isArray(root.pages)?root.pages.indexOf(id):0;
 const pages:PageUnit[]=document.modules.filter(m=>kindOf(m)==='page').sort((a,b)=>rank(a.id)-rank(b.id)).map(m=>({id:m.id,current:db(m),native:lv(m)?.native&&cloneTree(lv(m).native) as Obj,order:lv(m)?.order,mode:lv(m)?'native':'synth',items:m.elements.map(unit).filter((u):u is Unit=>!!u)}));
 const rootNative=lvRoot?cloneTree(lvRoot.native) as Obj:undefined,rootOrder:string[]=lvRoot?[...lvRoot.order]:[];
 const nameOf=(u:Unit)=>text(member(u.native,'name'))??u.id;
 const names=()=>new Map(datasets.map(u=>[u.id,nameOf(u)]));
 const ids={data:dataId,datasets:datasets.map(u=>u.id),pages:pages.map(p=>({id:p.id,items:p.items.map(i=>i.id)}))};
 const columns=root.layout.columns as number;
 const gridV1=(p:PageUnit)=>p.native?member(p.native,'layoutVersion')!==undefined:columns===12;
 const scale=(p:PageUnit)=>gridV1(p)||!pages.some(gridV1)?1:2;
 let assumptions=new Map<object,string[]>(),where=new Map<object,string>(),synthTrees=new Map<object,Obj>();
 const make=(u:object,native:Obj|undefined,mode:string,path:string,synth:(a:(s:string)=>void)=>Obj):Obj=>{
  where.set(u,path);if(mode==='native'&&native)return native;
  const list:string[]=[];assumptions.set(u,list);const out=synth(s=>list.push(s));synthTrees.set(u,out);return out;
 };
 // ---- synthesis from the neutral declaration ----
 function synthDataset(u:Unit,a:(s:string)=>void):Obj{
  const c=u.current;let body:string;
  if(c.source.kind==='query'){body=c.source.query.text;if(c.source.query.language!==SQL)a('Query language '+JSON.stringify(c.source.query.language)+' is written as Databricks SQL text without translation');}
  else{body='SELECT * FROM '+c.source.table;a('Table source '+JSON.stringify(c.source.table)+' is written as a SELECT * query');}
  const measures=Object.entries<any>(c.fields).filter(([,f])=>f.role==='measure').map(([name,f])=>{if(f.expression.language!==SQL)a('Measure '+JSON.stringify(name)+' expression language '+JSON.stringify(f.expression.language)+' is written as Databricks SQL without translation');return {displayName:name,...(f.description!==undefined?{description:f.description}:{}),expression:f.expression.text};});
  return tree({name:nameOf(u),displayName:c.title,queryLines:lines(body),...(measures.length?{columns:measures}:{})}) as Obj;
 }
 function synthItem(u:Unit,s:number,a:(s:string)=>void):Obj{
  const c=u.current,p=c.position,position={x:p.x/s,y:p.y,width:p.width/s,height:p.height};
  if(s!==1&&(p.x%s||p.width%s))a('Position is not a whole number of legacy six-column cells');
  if(c.kind==='text'){
   if(c.content.format!=='markdown')a('Plain text is written as a markdown text box, which re-imports as markdown');
   return tree({widget:{name:u.id,multilineTextboxSpec:{lines:lines(c.content.text)}},position}) as Obj;
  }
  const frame={showTitle:true,title:c.title,...(c.description!==undefined?{showDescription:true,description:c.description}:{})};
  a('Frame shows its title'+(c.description!==undefined?' and description':''));
  if(c.kind==='filter'){
   const used=new Set<string>(),queryNames=c.targets.map((t:any,i:number)=>{let n='q_'+u.id+'_'+t.dataset.element;if(used.has(n))n+='_'+i;used.add(n);return n;});
   const spec:any={version:2,widgetType:controlKeys[c.control],encodings:{fields:c.targets.map((t:any,i:number)=>({fieldName:t.field,displayName:c.title,queryName:queryNames[i]}))},frame};
   if(c.default){
    const first=c.default.values[0];a('Default selection data type inferred from the first value');
    spec.selection={defaultSelection:{values:{dataType:typeof first==='string'?'STRING':typeof first==='boolean'?'BOOLEAN':Number.isInteger(first)?'INTEGER':'DECIMAL',values:c.default.values.map((value:unknown)=>({value}))}}};
   }
   a('Filter spec version 2 and one query per target');
   return tree({widget:{name:u.id,queries:c.targets.map((t:any,i:number)=>({name:queryNames[i],query:{datasetName:names().get(t.dataset.element)??t.dataset.element,fields:[{name:t.field,expression:quote(t.field)}],disaggregated:false}})),spec},position}) as Obj;
  }
  const fields:any[]=[],known=new Map<string,string>(),taken=new Set<string>();
  const queryField=(e:any)=>{
   const key=JSON.stringify([e.aggregation,e.field,e.expression?.text]);if(known.has(key))return known.get(key)!;
   const q=quote(e.field),agg=e.aggregation;
   if(e.expression&&e.expression.language!==SQL)a('Expression language '+JSON.stringify(e.expression.language)+' is written as Databricks SQL without translation');
   const expression=agg==='none'?q:agg==='measure'?'MEASURE('+q+')':agg==='count-distinct'?'COUNT(DISTINCT '+q+')':agg==='custom'?e.expression.text:aggregates[agg]+'('+q+')';
   let name=agg==='none'?e.field:agg+'('+e.field+')',n=1;while(taken.has(name))name=agg+'('+e.field+')_'+(++n);
   taken.add(name);known.set(key,name);fields.push({name,expression});return name;
  };
  const scaleOf=(e:any)=>e.scale||e.sort?{type:e.scale,...(e.sort?{sort:e.sort.by==='custom'?{by:'custom-order',orderedValues:e.sort.values}:{by:e.sort.by.startsWith('label')?'natural-order'+(e.sort.by.endsWith('descending')?'-reversed':''):(e.channel==='x'?'y':'x')+(e.sort.by.endsWith('descending')?'-reversed':'')}}:{})}:undefined;
  const formatOf=(e:any)=>{
   const f=e.format;if(!f)return undefined;
   if(!formatKeys[f.kind]){a('Format kind '+f.kind+' has no Lakeview number format; omitted');return undefined;}
   return {type:formatKeys[f.kind],...(f.currency?{currencyCode:f.currency}:{}),...(f.abbreviation?{abbreviation:f.abbreviation}:{}),...(f.decimals!==undefined?{decimalPlaces:{type:'exact',places:f.decimals}}:{})};
  };
  const entry=(e:any)=>({fieldName:queryField(e),...(e.title!==undefined?{displayName:e.title}:{}),...(scaleOf(e)?{scale:scaleOf(e)}:{}),...(formatOf(e)?{format:formatOf(e)}:{})});
  const grouped=new Map<string,any[]>();
  for(const e of c.encodings){if(!channelKeys[e.channel]){a('Channel '+e.channel+' has no Lakeview encoding; omitted');continue;}grouped.set(channelKeys[e.channel]!,[...(grouped.get(channelKeys[e.channel]!)??[]),e]);}
  const encodings:any={};
  for(const [key,list] of grouped){
   if(key==='columns'||key==='extra')encodings[key]=list.map(entry);
   else if(list.length===1)encodings[key]=entry(list[0]);
   else{const {fieldName:_f,displayName:_d,...shared}=entry(list[0]);encodings[key]={fields:list.map(e=>({fieldName:queryField(e),...(e.title!==undefined?{displayName:e.title}:{})})),...shared};if(list.slice(1).some(e=>!same(scaleOf(e),scaleOf(list[0]))||!same(formatOf(e),formatOf(list[0]))))a('Repeated '+key+' encodings share the first encoding\'s scale and format');}
  }
  a('Spec version '+(versions[c.chart]??3)+' for widgetType '+c.chart+'; query fields named from their aggregation');
  return tree({widget:{name:u.id,queries:[{name:'main_query',query:{datasetName:names().get(c.dataset.element)??c.dataset.element,fields,disaggregated:c.rows==='detail'}}],spec:{version:versions[c.chart]??3,widgetType:c.chart,encodings,frame}},position}) as Obj;
 }
 function synthPage(p:PageUnit,layout:NativeJson,a:(s:string)=>void):Obj{
  const c=p.current;
  if(columns!==12&&columns!==6)a('Grid of '+columns+' columns has no Lakeview page layout; GRID_V1 (twelve columns) assumed');
  a(columns===6?'Legacy six-column page (no layoutVersion)':'layoutVersion GRID_V1');
  return assemble(undefined,[],{name:tree(p.id),displayName:tree(c.title),pageType:tree(c.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS'),...(columns===6?{}:{layoutVersion:tree('GRID_V1')}),layout});
 }
 function synthRoot(parts:Record<string,NativeJson>,a:(s:string)=>void):Obj{
  const t=root.theme,theme:any={};
  a('Datasets follow data module order and pages follow root.pages');
  if(t){
   if(t.fontFamily)theme.fontFamily=t.fontFamily;
   for(const [role,c] of Object.entries<any>(t.roles??{}))theme[roleKeys[role]!]=c;
   if(t.palette)theme.visualizationColors=t.palette;
   if(t.name)a('Theme name '+JSON.stringify(t.name)+' has no Lakeview member');
  }
  return assemble(undefined,['datasets','pages'],{...parts,...(Object.keys(theme).length?{uiSettings:tree({theme})}:{})});
 }
 // ---- assembly and re-projection ----
 function build(){
  assumptions=new Map();where=new Map();synthTrees=new Map();
  const datasetTrees=datasets.map((u,i)=>make(u,u.native,u.mode,'/datasets/'+i,a=>synthDataset(u,a)));
  const pageTrees=pages.map((p,i)=>{
   const items=p.items.map((u,j)=>make(u,u.native,u.mode,'/pages/'+i+'/layout/'+j,a=>synthItem(u,scale(p),a)));
   const parts={layout:{kind:'array',items} as NativeJson};
   return make(p,p.native&&assemble(p.native,p.order??Object.keys(p.native.members),parts),p.mode,'/pages/'+i,a=>synthPage(p,parts.layout,a));
  });
  const parts={datasets:{kind:'array',items:datasetTrees} as NativeJson,pages:{kind:'array',items:pageTrees} as NativeJson};
  return rootNative?assemble(rootNative,rootOrder,parts):synthRoot(parts,s=>(assumptions.get(rootKey)??assumptions.set(rootKey,[]).get(rootKey)!).push(s));
 }
 const rootKey={};
 const project=(built:Obj):LakeviewProjection=>projectLakeview(JSON.parse(renderTree(built)),ids,{title:root.title});
 let built=build(),projected=project(built);
 const baseOf=(owner:string,u:Unit)=>projected.elements.get(elementKey(owner,u.id));
 const changed=(owner:string,u:Unit)=>u.current!==undefined&&!same(u.current,baseOf(owner,u));
 // ---- patches: write each edited neutral member into its native counterpart ----
 function patchDataset(u:Unit,c:any,b:any){
  const n=u.native!;if(c.kind!=='dataset'||b?.kind!=='dataset')return;
  if(c.title!==b.title)n.members.displayName=tree(c.title);
  if(c.source.kind==='query'&&b.source.kind==='query'&&c.source.query.language===SQL&&c.source.query.text!==b.source.query.text){
   if(member(n,'queryLines')?.kind==='array')n.members.queryLines=tree(lines(c.source.query.text));else if(member(n,'query')?.kind==='string')n.members.query=tree(c.source.query.text);
  }
  const cols=member(n,'columns');
  for(const [name,f] of Object.entries<any>(c.fields)){
   const was=b.fields[name];if(f.role!=='measure'||was?.role!=='measure'||f.expression.language!==SQL)continue;
   const col=cols?.kind==='array'?cols.items.map(objOf).find(o=>text(member(o,'displayName'))===name):undefined;if(!col)continue;
   if(f.expression.text!==was.expression.text)col.members.expression=tree(f.expression.text);
   if(f.description!==was.description){if(f.description===undefined)delete col.members.description;else col.members.description=tree(f.description);}
  }
 }
 function patchItem(u:Unit,c:any,b:any,s:number){
  const item=u.native!,w=objOf(member(item,'widget'));if(!w||!b||c.kind!==b.kind)return;
  const pos=objOf(member(item,'position')),next=['x','y','width','height'].map(k=>c.position[k]/(k==='x'||k==='width'?s:1));
  if(!same(c.position,b.position)&&pos&&next.every(Number.isInteger))['x','y','width','height'].forEach((k,i)=>{pos.members[k]=tree(next[i]);});
  if(c.kind==='text'){
   if(same(c.content,b.content)||c.content.format!=='markdown')return;
   const box=objOf(member(w,'multilineTextboxSpec'));
   if(box)box.members.lines=tree(lines(c.content.text));else if(member(w,'textbox_spec')?.kind==='string')w.members.textbox_spec=tree(c.content.text);
   return;
  }
  const spec=objOf(member(w,'spec'));if(!spec)return;
  if(c.title!==b.title)ensure(spec,'frame').members.title=tree(c.title);
  if(c.description!==b.description){const frame=ensure(spec,'frame');if(c.description===undefined)delete frame.members.description;else frame.members.description=tree(c.description);}
  if(c.kind!=='filter')return;
  const byName=new Map([...names()].map(([id,name])=>[name,id])),queries=member(w,'queries'),fields=member(objOf(member(spec,'encodings')),'fields');
  const entries=(fields?.kind==='array'?fields.items:[]).flatMap(f=>{
   const fo=objOf(f),q=queries?.kind==='array'?queries.items.map(objOf).find(o=>text(member(o,'name'))===text(member(fo,'queryName'))):undefined,query=objOf(member(q,'query'));
   const qf=(member(query,'fields')?.kind==='array'?(member(query,'fields') as any).items:[]).map(objOf).find((o:Obj|undefined)=>text(member(o,'name'))===text(member(fo,'fieldName')));
   const ds=byName.get(text(member(query,'datasetName'))??''),column=unquote(text(member(qf,'expression'))??'');
   return fo&&query&&qf&&ds&&column?[{fo,query,qf,key:JSON.stringify([ds,column])}]:[];
  });
  const keys=[...new Set(entries.map(e=>e.key))];
  if(keys.length===c.targets.length&&keys.length===b.targets.length)c.targets.forEach((t:any,i:number)=>{
   if(JSON.stringify([t.dataset.element,t.field])===JSON.stringify([b.targets[i].dataset.element,b.targets[i].field]))return;
   for(const e of entries.filter(x=>x.key===keys[i])){e.query.members.datasetName=tree(names().get(t.dataset.element)??t.dataset.element);e.qf.members.name=tree(t.field);e.qf.members.expression=tree(quote(t.field));e.fo.members.fieldName=tree(t.field);}
  });
  if(c.default&&b.default&&!same(c.default,b.default)){
   const values=member(objOf(member(objOf(member(objOf(member(spec,'selection')),'defaultSelection')),'values')),'values');
   if(values?.kind==='array'&&values.items.length===c.default.values.length)values.items.forEach((v,i)=>{const o=objOf(v);if(o)o.members.value=tree(c.default.values[i]);});
  }
 }
 function patchPage(p:PageUnit,c:any,b:any){
  if(!p.native||c.kind!=='page'||b?.kind!=='page')return;
  const set=(k:string,v:string)=>{p.native!.members[k]=tree(v);if(p.order&&!p.order.includes(k))p.order.push(k);};
  if(c.title!==b.title)set('displayName',c.title);
  if(c.role!==b.role)set('pageType',c.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS');
 }
 function patchRoot(c:any,b:any){
  if(!rootNative||same(c.theme,b.theme)||!c.theme)return;
  const ui=ensure(rootNative,'uiSettings'),theme=ensure(ui,'theme');if(!rootOrder.includes('uiSettings'))rootOrder.push('uiSettings');
  const t=c.theme,was=b.theme??{};
  if(t.fontFamily!==undefined&&t.fontFamily!==was.fontFamily)theme.members.fontFamily=tree(t.fontFamily);
  if(t.palette&&!same(t.palette,was.palette))theme.members.visualizationColors=tree(t.palette);
  for(const [role,color] of Object.entries<any>(t.roles??{}))if(!same(color,was.roles?.[role]))theme.members[roleKeys[role]!]=tree(color);
 }
 datasets.forEach(u=>{if(u.mode==='native'&&changed(dataId,u))patchDataset(u,u.current,baseOf(dataId,u));});
 pages.forEach(p=>{
  if(p.mode==='native'&&p.current&&!same(p.current,projected.modules.get(p.id)))patchPage(p,p.current,projected.modules.get(p.id));
  p.items.forEach(u=>{if(u.mode==='native'&&changed(p.id,u))patchItem(u,u.current,baseOf(p.id,u),scale(p));});
 });
 patchRoot(root,projected.root);
 built=build();projected=project(built);
 // ---- fall back to synthesis where a patch did not reproduce the neutral declaration ----
 const issues:LakeviewExportIssue[]=[];
 const resynth=(owner:string,u:Unit)=>{if(u.mode==='native'&&u.native&&changed(owner,u)){u.resynth=u.native;u.mode='synth';}};
 datasets.forEach(u=>resynth(dataId,u));pages.forEach(p=>p.items.forEach(u=>resynth(p.id,u)));
 built=build();projected=project(built);
 const units=[...datasets,...pages.flatMap(p=>p.items),...pages];
 for(const u of units)if(assumptions.has(u)){
  const dropped=u.resynth?lost(u.resynth,synthTrees.get(u)):[];
  issues.push({path:where.get(u)!,code:'LAKEVIEW_EXPORT_SYNTHESIZED',classification:'representation-change',detail:
   (u.resynth?'The retained native JSON no longer matched the edited neutral declaration and was replaced'+(dropped.length?'; native members not carried over: '+dropped.slice(0,20).join(', ')+(dropped.length>20?', and '+(dropped.length-20)+' more':''):'')+'. ':'')+'Native JSON synthesized from the neutral declaration. Assumed: '+assumptions.get(u)!.join('; ')+'.'});
 }
 if(assumptions.has(rootKey))issues.push({path:'',code:'LAKEVIEW_EXPORT_SYNTHESIZED',classification:'representation-change',detail:'Dashboard container synthesized from the neutral declaration. Assumed: '+assumptions.get(rootKey)!.join('; ')+'.'});
 // ---- whatever the re-imported file would not reproduce is reported ----
 const missing=(path:string,c:any,b:any)=>{const paths=diff(c,b);if(paths.length)issues.push({path,code:'LAKEVIEW_EXPORT_UNMAPPED',classification:'unsupported',detail:'Neutral members not reproduced by the exported file (JSON Pointers into the neutral declaration): '+paths.join(', ')});};
 for(const u of datasets)if(u.current)missing(where.get(u)!,u.current,baseOf(dataId,u));
 for(const p of pages){
  if(p.current)missing(where.get(p)!,p.current,projected.modules.get(p.id));
  for(const u of p.items)if(u.current)missing(where.get(u)!,u.current,baseOf(p.id,u));
 }
 missing('',root,projected.root);
 // .lvdash.json has no member for the dashboard's own name or description.
 issues.push({path:'',code:'LAKEVIEW_EXPORT_UNMAPPED',classification:'annotation-only',detail:'Dashboard title '+JSON.stringify(root.title)+(root.description!==undefined?' and description':'')+(root.description!==undefined?' have':' has')+' no .lvdash.json member; the workspace names the dashboard'});
 return {text:renderTree(built),issues};
}
