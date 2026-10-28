// SPDX-License-Identifier: MIT OR Apache-2.0
import type {LakeviewIssue} from './project';
// Inverse of project.ts: builds .lvdash.json members from umf.dashboard payloads and reports what it had to assume.
const widgetTypes:Record<string,{type:string;version:number}>={counter:{type:'counter',version:2},table:{type:'table',version:2},bar:{type:'bar',version:3},line:{type:'line',version:3},area:{type:'area',version:3},scatter:{type:'scatter',version:3},pie:{type:'pie',version:3},heatmap:{type:'heatmap',version:3}};
const controls:Record<string,string>={'single-select':'filter-single-select','multi-select':'filter-multi-select','date-range':'filter-date-range-picker','text-search':'filter-text-entry',range:'filter-range-slider'};
const channels:Record<string,string>={x:'x',y:'y',color:'color',size:'size',label:'label',value:'value',target:'target',angle:'angle',tooltip:'extra',column:'columns'};
const aggregates:Record<string,string>={sum:'SUM',avg:'AVG',min:'MIN',max:'MAX',count:'COUNT'};
const formatTypes:Record<string,string>={number:'number',currency:'number-currency',percent:'number-percent'};
const roles:Record<string,string>={canvasBackground:'canvasBackgroundColor',widgetBackground:'widgetBackgroundColor',widgetBorder:'widgetBorderColor',font:'fontColor',selection:'selectionColor'};
export interface Synth {native:any;issues:LakeviewIssue[];}
export interface SynthContext {datasetName(reference:{module:string;element:string}):string|undefined;}
const tick=(name:string)=>'`'+name.replaceAll('`','``')+'`';
const lines=(text:string)=>text.match(/[^\n]*\n|[^\n]+$/g)??[];
const synthIssue=(issues:LakeviewIssue[],path:string,code:string,classification:LakeviewIssue['classification'],detail:string)=>issues.push({path,code,classification,detail,retainedInSource:true});
/** Native dashboard members `uiSettings.theme` carries for a neutral theme. */
export function synthesizeTheme(theme:any):any{
 const out:any={};if(!theme)return out;
 if(typeof theme.fontFamily==='string')out.fontFamily=theme.fontFamily;
 if(Array.isArray(theme.palette))out.visualizationColors=[...theme.palette];
 for(const [role,native] of Object.entries(roles))if(theme.roles?.[role])out[native]={...theme.roles[role]};
 return out;
}
export function synthesizePage(page:any,columns:number){
 return {displayName:page.title,pageType:page.role==='global-filters'?'PAGE_TYPE_GLOBAL_FILTERS':'PAGE_TYPE_CANVAS',...(columns===12?{layoutVersion:'GRID_V1'}:{})};
}
export function synthesizeDataset(name:string,payload:any,path:string):Synth{
 const issues:LakeviewIssue[]=[],src=payload.source;let text:string;
 if(src.kind==='query')text=src.query.text;
 else{text='SELECT * FROM '+src.table;synthesizeAssume(issues,path+'/queryLines','Table source '+JSON.stringify(src.table)+' is exported as the query '+JSON.stringify(text));}
 if(src.kind==='query'&&src.query.language!=='databricks-sql')synthIssue(issues,path+'/queryLines','LAKEVIEW_SYNTH_LANGUAGE','unsupported','Query language '+JSON.stringify(src.query.language)+' is written as Databricks SQL without translation');
 const columns:any[]=[];
 for(const [field,decl] of Object.entries<any>(payload.fields)){
  if(decl.role==='measure'&&decl.expression){
   columns.push({displayName:field,...(decl.description?{description:decl.description}:{}),expression:decl.expression.text});
   if(decl.expression.language!=='databricks-sql')synthIssue(issues,path+'/columns/'+(columns.length-1)+'/expression','LAKEVIEW_SYNTH_LANGUAGE','unsupported','Measure language '+JSON.stringify(decl.expression.language)+' is written as Databricks SQL without translation');
  } else if(decl.role==='measure')synthIssue(issues,path,'LAKEVIEW_SYNTH_FIELD','unsupported','Measure '+JSON.stringify(field)+' has no expression and is not exported');
  else for(const key of ['type','title','description'])if(decl[key]!==undefined)synthIssue(issues,path,'LAKEVIEW_SYNTH_FIELD','annotation-only','Column '+JSON.stringify(field)+' '+key+' is not carried: Lakeview derives columns from the query');
 }
 for(const key of ['grain','description'])if(payload[key]!==undefined)synthIssue(issues,path,'LAKEVIEW_SYNTH_ANNOTATION','annotation-only','Dataset '+key+' has no native member and is not exported');
 return {native:{name,displayName:payload.title,queryLines:lines(text),...(columns.length?{columns}:{})},issues};
}
function synthesizeAssume(issues:LakeviewIssue[],path:string,detail:string){synthIssue(issues,path,'LAKEVIEW_SYNTH_ASSUMPTION','representation-change',detail);}
function expressionOf(e:any,path:string,issues:LakeviewIssue[]):string{
 const f=tick(e.field);
 switch(e.aggregation){
  case 'none':return f;
  case 'measure':return 'MEASURE('+f+')';
  case 'count-distinct':return 'COUNT(DISTINCT '+f+')';
  case 'custom':if(e.expression){if(e.expression.language!=='databricks-sql')synthIssue(issues,path,'LAKEVIEW_SYNTH_LANGUAGE','unsupported','Expression language '+JSON.stringify(e.expression.language)+' is written as Databricks SQL without translation');return e.expression.text;}synthIssue(issues,path,'LAKEVIEW_SYNTH_FIELD','unsupported','Custom aggregation of '+JSON.stringify(e.field)+' has no expression; the bare column is used');return f;
  default:return aggregates[e.aggregation]+'('+f+')';
 }
}
function formatOf(format:any,path:string,issues:LakeviewIssue[]){
 const type=formatTypes[format?.kind];
 if(!type){if(format)synthIssue(issues,path,'LAKEVIEW_SYNTH_FORMAT','unsupported','Format kind '+JSON.stringify(format.kind)+' has no native format and is not exported');return undefined;}
 return {type,...(format.currency?{currencyCode:format.currency}:{}),...(format.abbreviation?{abbreviation:format.abbreviation}:{}),...(format.decimals!==undefined?{decimalPlaces:{type:'exact',places:format.decimals}}:{})};
}
function scaleOf(e:any,channel:string,path:string,issues:LakeviewIssue[]){
 const out:any={};if(e.scale)out.type=e.scale;
 const s=e.sort;if(!s)return out;
 if(s.by==='custom'){out.sort={by:'custom-order',orderedValues:[...(s.values??[])]};return out;}
 const [kind,direction]=s.by.split('-'),suffix=direction==='descending'?'-reversed':'';
 if(kind==='label')out.sort={by:'natural-order'+suffix};
 else{
  // Native value sorts name the other axis; only x and y have one.
  const other=channel==='x'?'y':channel==='y'?'x':undefined;
  if(!other)synthesizeAssume(issues,path,'Value sort on channel '+JSON.stringify(channel)+' has no counterpart axis; sorting by y is assumed');
  out.sort={by:(other??'y')+suffix};
 }
 return out;
}
/** A layout item for a visual, filter or text payload; `path` points at the item in the exported dashboard. */
export function synthesizeItem(name:string,payload:any,path:string,context:SynthContext):Synth|undefined{
 const issues:LakeviewIssue[]=[],wp=path+'/widget',pos=payload.position;
 const item=(widget:any)=>({native:{widget:{name,...widget},position:{...pos}},issues});
 if(payload.kind==='text'){
  if(payload.content.format==='plain')synthesizeAssume(issues,wp+'/multilineTextboxSpec','Plain text is exported as a Markdown text box');
  return item({multilineTextboxSpec:{lines:lines(payload.content.text)}});
 }
 const frame=(description?:string)=>({showTitle:true,title:payload.title,...(description?{showDescription:true,description}:{})});
 if(payload.kind==='visual'){
  const type=widgetTypes[payload.chart],ds=context.datasetName(payload.dataset);
  if(!type||ds===undefined){synthIssue(issues,wp,'LAKEVIEW_SYNTH_SKIPPED','unsupported',!type?'Chart '+JSON.stringify(payload.chart)+' has no native widget type':'Dataset reference '+JSON.stringify(payload.dataset)+' is not exported; the widget is omitted');return {native:undefined,issues};}
  synthesizeAssume(issues,wp+'/spec/version','Widget spec version '+type.version+' assumed for '+type.type);
  const fields:any[]=[],names=new Map<string,string>(),encodings:any={};
  const field=(e:any,i:number)=>{const expression=expressionOf(e,wp+'/queries/0/query/fields',issues);let n:string=names.get(expression)??'';if(!n){n=e.aggregation==='none'?e.field:e.aggregation==='measure'?'measure('+e.field+')':(aggregates[e.aggregation]??e.aggregation).toLowerCase()+'('+e.field+')';if([...names.values()].includes(n))n+='_'+i;names.set(expression,n);fields.push({name:n,expression});}return n;};
  payload.encodings.forEach((e:any,i:number)=>{
   const key=channels[e.channel],ep=wp+'/spec/encodings/'+(key??e.channel);
   if(!key){synthIssue(issues,ep,'LAKEVIEW_SYNTH_ENCODING','unsupported','Channel '+JSON.stringify(e.channel)+' of field '+JSON.stringify(e.field)+' has no native encoding and is not exported');return;}
   const native:any={fieldName:field(e,i),...(e.title?{displayName:e.title}:{})};
   if(e.channel==='column')native.visible=true;
   else{const scale=scaleOf(e,e.channel,ep+'/scale',issues);if(Object.keys(scale).length)native.scale=scale;}
   const format=formatOf(e.format,ep+'/format',issues);if(format)native.format=format;
   if(key==='extra'||key==='columns')(encodings[key]??=[]).push(native);
   else if(encodings[key]===undefined)encodings[key]=native;
   else encodings[key]=[...(Array.isArray(encodings[key])?encodings[key]:[encodings[key]]),native];
  });
  if(!fields.length){synthIssue(issues,wp,'LAKEVIEW_SYNTH_SKIPPED','unsupported','No encoding of the visual has a native form; the widget is omitted');return {native:undefined,issues};}
  return item({queries:[{name:'main_query',query:{datasetName:ds,fields,disaggregated:payload.rows==='detail'}}],spec:{version:type.version,widgetType:type.type,encodings,frame:frame(payload.description)}});
 }
 if(payload.kind==='filter'){
  const control=controls[payload.control],queries:any[]=[],fields:any[]=[];
  for(const target of payload.targets){
   const ds=context.datasetName(target.dataset);
   if(ds===undefined){synthIssue(issues,wp+'/queries','LAKEVIEW_SYNTH_TARGET','unsupported','Filter target '+JSON.stringify(target)+' names a dataset that is not exported; the target is omitted');continue;}
   const q='q_'+name+'_'+ds;
   queries.push({name:q,query:{datasetName:ds,fields:[{name:target.field,expression:tick(target.field)}],disaggregated:false}});
   fields.push({fieldName:target.field,displayName:payload.title,queryName:q});
  }
  if(!queries.length){synthIssue(issues,wp,'LAKEVIEW_SYNTH_SKIPPED','unsupported','No filter target is exported; the widget is omitted');return {native:undefined,issues};}
  synthesizeAssume(issues,wp+'/spec/version','Widget spec version 2 assumed for '+control);
  const spec:any={version:2,widgetType:control,encodings:{fields},frame:frame()};
  const values:any[]=payload.default?.values??[];
  if(values.length){
   const kinds=new Set(values.map(v=>typeof v)),dataType=kinds.size!==1?undefined:typeof values[0]==='string'?'STRING':typeof values[0]==='boolean'?'BOOLEAN':values.every(Number.isInteger)?'INTEGER':'DECIMAL';
   if(dataType===undefined)synthIssue(issues,wp+'/spec/selection','LAKEVIEW_SYNTH_DEFAULT','unsupported','Default values of mixed types cannot share one native data type; the default is not exported');
   else{synthesizeAssume(issues,wp+'/spec/selection/defaultSelection/values/dataType','Default value data type '+dataType+' inferred from the JSON values');spec.selection={defaultSelection:{values:{dataType,values:values.map(value=>({value}))}}};}
  }
  return item({queries,spec});
 }
 return undefined;
}
