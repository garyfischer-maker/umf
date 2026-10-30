// SPDX-License-Identifier: MIT OR Apache-2.0
import {parseNativeJson,type NativeJson} from '../../model/native-json';
import {pointer} from '../../model/types';
import type {LakeviewIssue} from './project';
type ObjectTree=Extract<NativeJson,{kind:'object'}>;
export interface ExportContext {issues:LakeviewIssue[];nameOf:(ref:{module:string;element:string})=>string|undefined;}
const SQL='databricks-sql';
const controls:Record<string,string>={'single-select':'filter-single-select','multi-select':'filter-multi-select','date-range':'filter-date-range-picker','text-search':'filter-text-entry','range':'filter-range-slider'};
const keys:Record<string,string>={x:'x',y:'y',color:'color',size:'size',label:'label',value:'value',target:'target',angle:'angle',tooltip:'extra',column:'columns'};
const functions:Record<string,string>={sum:'SUM',avg:'AVG',min:'MIN',max:'MAX',count:'COUNT'};
const formats:Record<string,string>={number:'number',currency:'number-currency',percent:'number-percent'};
const roles:Record<string,string>={canvasBackground:'canvasBackgroundColor',widgetBackground:'widgetBackgroundColor',widgetBorder:'widgetBorderColor',font:'fontColor',selection:'selectionColor'};
const quote=(name:string)=>'`'+name.replaceAll('`','``')+'`';
const json=(a:unknown)=>JSON.stringify(a);
export const member=(root:NativeJson|undefined,...path:string[]):NativeJson|undefined=>{let at=root;for(const key of path){if(at?.kind!=='object')return undefined;at=at.members[key];}return at;};
export const fromJs=(value:unknown):NativeJson=>parseNativeJson(JSON.stringify(value));
export const leaves=(node:NativeJson,path='',out:string[]=[]):string[]=>{
 if(node.kind==='object'){for(const [k,v] of Object.entries(node.members))leaves(v,path+'/'+pointer(k),out);if(!Object.keys(node.members).length)out.push(path);}
 else if(node.kind==='array'){node.items.forEach((v,i)=>leaves(v,path+'/'+i,out));if(!node.items.length)out.push(path);}
 else out.push(path);
 return out;
};
const assume=(ctx:ExportContext,path:string,detail:string)=>ctx.issues.push({path,code:'LAKEVIEW_EXPORT_ASSUMPTION',classification:'representation-change',detail,retainedInSource:true});
/** Native members that exist only in the retained JSON and are absent from regenerated JSON are reported, not dropped silently. */
export function reportResynthesis(ctx:ExportContext,path:string,before:NativeJson,after:NativeJson){
 const kept=new Set(leaves(after)),dropped=leaves(before).filter(p=>!kept.has(p));
 ctx.issues.push({path,code:'LAKEVIEW_EXPORT_RESYNTHESIZED',classification:'representation-change',detail:'Regenerated from the neutral declaration because the edit is not a member-level change'+(dropped.length?'; retained native members no longer present: '+dropped.slice(0,10).join(', ')+(dropped.length>10?' and '+(dropped.length-10)+' more':''):''),retainedInSource:true});
}
function setIn(root:ObjectTree,path:string[],node:NativeJson){
 let at=root;for(const key of path.slice(0,-1)){const next=at.members[key];if(next?.kind==='object')at=next;else{const made:ObjectTree={kind:'object',members:{}};at.members[key]=made;at=made;}}
 at.members[path.at(-1)!]=node;
}
const lines=(text:string)=>text.split(/(?<=\n)/);
const expression=(e:any)=>e.aggregation==='none'?quote(e.field):e.aggregation==='measure'?'MEASURE('+quote(e.field)+')':e.aggregation==='count-distinct'?'COUNT(DISTINCT '+quote(e.field)+')':e.aggregation==='custom'?e.expression.text:functions[e.aggregation]+'('+quote(e.field)+')';
export function synthDataset(id:string,p:any,ctx:ExportContext,path:string):any{
 let query:string;
 if(p.source.kind==='query'){query=p.source.query.text;if(p.source.query.language!==SQL)assume(ctx,path,'Query language '+json(p.source.query.language)+' is written as Databricks SQL text');}
 else{query='SELECT * FROM '+p.source.table;assume(ctx,path,'Table source '+json(p.source.table)+' is written as '+json(query)+'; Lakeview datasets declare queries');}
 const columns:any[]=[];
 for(const [name,f] of Object.entries<any>(p.fields)){
  if(f.role==='measure')columns.push({displayName:name,...(f.description!==undefined?{description:f.description}:{}),expression:f.expression.text});
  else if(f.type||f.title||f.description||f.expression)assume(ctx,path+'/columns',"Column "+json(name)+' metadata (type, title, description, expression) has no Lakeview dataset member; it is not exported');
 }
 if(p.grain!==undefined)assume(ctx,path,'Dataset grain is not exported');
 return {name:id,displayName:p.title,queryLines:lines(query),...(columns.length?{columns}:{})};
}
export function synthWidget(name:string,p:any,ctx:ExportContext,path:string):any{
 const position={...p.position},at=path+'/widget';
 if(p.kind==='text')return {widget:{name,multilineTextboxSpec:{lines:lines(p.content.text)}},position};
 const frame:any={showTitle:true,title:p.title,...(p.description!==undefined?{showDescription:true,description:p.description}:{})};
 assume(ctx,at,'Widget spec version is assumed (filters and counters 2, other charts 3); widget identity '+json(name)+' comes from the element id');
 if(p.kind==='filter'){
  const queries:any[]=[],fields:any[]=[];
  p.targets.forEach((t:any,i:number)=>{
   const ds=ctx.nameOf(t.dataset);if(ds===undefined){assume(ctx,at,'Filter target dataset '+json(t.dataset)+' is not exported; the target is omitted');return;}
   const q='q_'+name+'_'+i;queries.push({name:q,query:{datasetName:ds,fields:[{name:t.field,expression:quote(t.field)}],disaggregated:false}});fields.push({fieldName:t.field,displayName:p.title,queryName:q});
  });
  const spec:any={version:2,widgetType:controls[p.control],encodings:{fields},frame};
  if(p.default){const v=p.default.values,type=typeof v[0]==='string'?'STRING':typeof v[0]==='boolean'?'BOOLEAN':Number.isInteger(v[0])?'INTEGER':'DECIMAL';spec.selection={defaultSelection:{values:{dataType:type,values:v.map((value:unknown)=>({value}))}}};assume(ctx,at+'/spec/selection','Default selection data type '+type+' is inferred from the neutral values');}
  return {widget:{name,queries,spec},position};
 }
 const ds=ctx.nameOf(p.dataset);if(ds===undefined)assume(ctx,at,'Dataset '+json(p.dataset)+' is not exported; the widget has no query');
 const fields:any[]=[],names=new Map<string,string>();
 const fieldName=(e:any)=>{const x=expression(e),n=names.get(x)??(e.aggregation==='none'?e.field:e.aggregation+'('+e.field+')');if(!names.has(x)){names.set(x,n);fields.push({name:n,expression:x});}return n;};
 const spec:any={version:['counter','table'].includes(p.chart)?2:3,widgetType:p.chart,encodings:{},frame};
 const byChannel=new Map<string,any[]>();
 for(const [i,e] of (p.encodings as any[]).entries()){
  if(keys[e.channel]===undefined){assume(ctx,at+'/encodings',"Channel "+json(e.channel)+' has no Lakeview encoding; encoding '+i+' is not exported');continue;}
  const out:any={fieldName:fieldName(e),...(e.title!==undefined?{displayName:e.title}:{})};
  if(e.scale||e.sort){
   out.scale={...(e.scale?{type:e.scale}:{})};
   if(e.sort?.by==='custom')out.scale.sort={by:'custom-order',orderedValues:[...e.sort.values]};
   else if(e.sort){const [axis,dir]=e.sort.by.split('-'),other=e.channel==='x'?'y':'x';out.scale.sort={by:(axis==='label'?'natural-order':other)+(dir==='descending'?'-reversed':'')};assume(ctx,at+'/spec/encodings/'+keys[e.channel],'Sort '+e.sort.by+' is written as '+json(out.scale.sort.by));}
  }
  if(e.format){
   if(e.format.kind==='date')assume(ctx,at+'/spec/encodings/'+keys[e.channel],'Date format has no Lakeview number format; it is not exported');
   else out.format={type:formats[e.format.kind],...(e.format.currency!==undefined?{currencyCode:e.format.currency}:{}),...(e.format.abbreviation!==undefined?{abbreviation:e.format.abbreviation}:{}),...(e.format.decimals!==undefined?{decimalPlaces:{type:'exact',places:e.format.decimals}}:{})};
  }
  byChannel.set(e.channel,[...(byChannel.get(e.channel)??[]),out]);
 }
 for(const [channel,list] of byChannel)spec.encodings[keys[channel]!]=channel==='column'||list.length>1?list:list[0];
 return {widget:{name,queries:[{name:'main_query',query:{...(ds!==undefined?{datasetName:ds}:{}),fields,disaggregated:p.rows==='detail'}}],spec},position};
}
export function synthPage(id:string,p:any,layout:any[]):any{return {name:id,displayName:p.title,layout,pageType:p.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS',layoutVersion:'GRID_V1'};}
export function synthTheme(theme:any,ctx:ExportContext):any{
 if(!theme)return undefined;
 const out:any={};if(theme.fontFamily)out.fontFamily=theme.fontFamily;if(theme.palette)out.visualizationColors=[...theme.palette];
 for(const [role,colors] of Object.entries<any>(theme.roles??{}))out[roles[role]!]={...colors};
 if(theme.name!==undefined)assume(ctx,'/uiSettings/theme','Theme name has no Lakeview member; it is not exported');
 return out;
}
/** Applies a neutral edit to a retained layout item or dataset as member-level changes. Returns false when the edit needs regeneration. */
export function patchItem(native:ObjectTree,base:any,cur:any,ctx:ExportContext,scale:number):boolean{
 const changed=new Set(Object.keys({...base,...cur}).filter(k=>k!=='trace'&&json(base[k])!==json(cur[k])));
 const spec=['widget','spec'];
 const handled=new Set(cur.kind==='dataset'?['title','source']:cur.kind==='text'?['position','content']:cur.kind==='visual'?['title','description','position']:['title','description','position','control','default','targets']);
 if(cur.kind!==base.kind||[...changed].some(k=>!handled.has(k)))return false;
 for(const key of changed){
  if(key==='title'){if(cur.kind==='dataset')setIn(native,['displayName'],fromJs(cur.title));else setIn(native,[...spec,'frame','title'],fromJs(cur.title));}
  else if(key==='description'){if(cur.description===undefined)return false;setIn(native,[...spec,'frame','description'],fromJs(cur.description));if(member(native,...spec,'frame','showDescription')===undefined)setIn(native,[...spec,'frame','showDescription'],fromJs(true));}
  else if(key==='position'){
   for(const k of ['x','width']){const v=cur.position[k]/scale;if(!Number.isInteger(v))return false;setIn(native,['position',k],fromJs(v));}
   for(const k of ['y','height'])setIn(native,['position',k],fromJs(cur.position[k]));
  }
  else if(key==='content'){
   if(member(native,'widget','multilineTextboxSpec','lines'))setIn(native,['widget','multilineTextboxSpec','lines'],fromJs(lines(cur.content.text)));
   else if(member(native,'widget','textbox_spec'))setIn(native,['widget','textbox_spec'],fromJs(cur.content.text));
   else return false;
  }
  else if(key==='control'){setIn(native,[...spec,'widgetType'],fromJs(controls[cur.control]));}
  else if(key==='default'){
   const values=member(native,...spec,'selection','defaultSelection','values','values');
   if(!cur.default||values?.kind!=='array')return false;
   setIn(native,[...spec,'selection','defaultSelection','values','values'],fromJs(cur.default.values.map((value:unknown)=>({value}))));
  }
  else if(key==='targets'){if(!patchTargets(native,base,cur,ctx))return false;}
  else if(key==='source'){
   if(cur.source.kind!=='query'||base.source.kind!=='query'||json(cur.source.query)!==json({...base.source.query,text:cur.source.query.text}))return false;
   if(member(native,'queryLines'))setIn(native,['queryLines'],fromJs(lines(cur.source.query.text)));
   else if(member(native,'query'))setIn(native,['query'],fromJs(cur.source.query.text));
   else return false;
  }
 }
 return true;
}
// Native filter entries read each target as: encodings.fields[i] -> query by name -> dataset and column.
function patchTargets(native:ObjectTree,base:any,cur:any,ctx:ExportContext):boolean{
 if(base.targets.length!==cur.targets.length)return false;
 const fields=member(native,'widget','spec','encodings','fields'),queries=member(native,'widget','queries');
 if(fields?.kind!=='array'||queries?.kind!=='array')return false;
 const text=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:undefined;
 for(const [t,target] of cur.targets.entries()){
  if(json(target)===json(base.targets[t]))continue;
  const dataset=ctx.nameOf(target.dataset);if(dataset===undefined)return false;
  let hit=0;
  for(const entry of fields.items){
   const query=queries.items.find(q=>text(member(q,'name'))===text(member(entry,'queryName'))),qf=member(query,'query','fields');
   if(entry.kind!=='object'||qf?.kind!=='array'||!query)continue;
   const field=qf.items.find(f=>text(member(f,'name'))===text(member(entry,'fieldName'))),expr=text(member(field,'expression')),dsn=text(member(query,'query','datasetName'));
   if(!field||field.kind!=='object'||expr===undefined||dsn===undefined)continue;
   const was=ctx.nameOf(base.targets[t].dataset);
   if(dsn!==was||expr!==quote(base.targets[t].field))continue;
   (member(query,'query') as ObjectTree).members.datasetName=fromJs(dataset);
   field.members.name=fromJs(target.field);field.members.expression=fromJs(quote(target.field));entry.members.fieldName=fromJs(target.field);hit++;
  }
  if(!hit)return false;
 }
 return true;
}
