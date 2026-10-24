// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportLakeviewDashboard,exportNeutralToLakeview,inspectDashboard,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const authored=await Bun.file('fixtures/dashboard/marketing-campaign.json').json() as Document;
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=()=>importLakeviewDashboard(source,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const edit=(doc:Document,module:string,id:string,change:(value:any)=>void)=>{const copy=copyJson(doc as any) as Document;change(copy.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!.extensions['umf.dashboard']);return copy;};
/** Paths of every leaf whose value differs, so a test can state exactly which native members an edit touched. */
function diff(a:any,b:any,path=''):string[]{
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);return [...keys].flatMap(k=>diff(a[k],b[k],path+'/'+k));
 }
 return [path];
}
const changed=(text:string)=>diff(JSON.parse(source),JSON.parse(text));
const pageIndex=(name:string)=>JSON.parse(source).pages.findIndex((p:any)=>p.name===name);
const itemIndex=(page:string,widget:string)=>JSON.parse(source).pages[pageIndex(page)].layout.findIndex((l:any)=>l.widget.name===widget);
test('@covers US-094-AC1: an unedited import exports the source tokens and member order, with nothing to report',()=>{
 const result=exportNeutralToLakeview(load());
 expect(result.text).toBe(compact(source));expect(result.text).toBe(exportLakeviewDashboard(load()));expect(result.issues).toEqual([]);
});
test('@covers US-094-AC2: editing a visual title, a filter target and a page title changes only the corresponding native members',()=>{
 let doc=load();
 doc=edit(doc,'overview','w-111-by-channel',v=>{v.title='Performance by Medium';});
 expect(changed(exportNeutralToLakeview(doc).text)).toEqual(['/pages/'+pageIndex('overview')+'/layout/'+itemIndex('overview','w-111-by-channel')+'/widget/spec/frame/title']);
 const filter=edit(load(),'filters','filter-channel',v=>{expect(v.targets[0].field).toBe('channel');v.targets[0].field='source';});
 const out=exportNeutralToLakeview(filter),paths=changed(out.text),base='/pages/'+pageIndex('filters')+'/layout/'+itemIndex('filters','filter-channel')+'/widget/';
 expect(paths.length).toBeGreaterThan(0);expect(paths.every(p=>p.startsWith(base))).toBe(true);
 expect(out.issues).toEqual([]);
 const page=copyJson(load() as any) as Document;(page.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any).title='Details';
 expect(changed(exportNeutralToLakeview(page).text)).toEqual(['/pages/'+pageIndex('campaign_details')+'/displayName']);
 const moved=edit(load(),'overview','w-101-impressions',v=>{v.position.x=1;v.position.width=1;});
 const at='/pages/'+pageIndex('overview')+'/layout/'+itemIndex('overview','w-101-impressions')+'/position/';
 expect(changed(exportNeutralToLakeview(moved).text).sort()).toEqual([at+'width',at+'x']);
});
const neutral=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)?.elements.find(e=>e.id===id)?.extensions['umf.dashboard'] as any;
test('@covers US-094-AC3: a document without umf.lakeview payloads exports a dashboard that re-imports to an equivalent declaration',()=>{
 const result=exportNeutralToLakeview(authored),again=importLakeviewDashboard(result.text,{id:authored.id,title:'Marketing Campaign Performance'}).document;
 expect(inspectDashboard(again).valid).toBe(true);
 const strip=(v:any)=>{const {trace,...rest}=v;return rest;};
 const root=(d:Document)=>d.extensions!['umf.dashboard'] as any;
 expect(root(again).pages).toEqual(root(authored).pages);expect(root(again).layout).toEqual(root(authored).layout);expect(root(again).theme).toMatchObject(root(authored).theme);
 for(const module of authored.modules)for(const element of module.elements){
  const was=neutral(authored,module.id,element.id),now=neutral(again,module.id,element.id);
  if(was.kind==='dataset'){
   expect(now.source).toEqual(was.source);
   for(const [name,field] of Object.entries<any>(was.fields))if(field.role==='measure')expect(now.fields[name]).toMatchObject({role:'measure',expression:field.expression});
   continue;
  }
  const keep=(v:any)=>{const {trace,...rest}=v;return v.kind==='text'?{...rest,content:{...rest.content,format:'markdown'}}:rest;};
  expect(keep(now)).toEqual(keep(was));
 }
 expect(result.issues.filter(i=>i.code==='LAKEVIEW_EXPORT_DROPPED').length).toBeGreaterThan(0);
});
test('@covers US-094-AC4: edits without a one-to-one native member rebuild that unit only and report it; edits to datasets and themes stay local',()=>{
 const doc=edit(load(),'overview','w-111-by-channel',v=>{v.chart='line';});
 const out=exportNeutralToLakeview(doc),base='/pages/'+pageIndex('overview')+'/layout/'+itemIndex('overview','w-111-by-channel')+'/';
 const paths=changed(out.text);expect(paths.length).toBeGreaterThan(0);expect(paths.every(p=>p.startsWith(base))).toBe(true);
 expect(JSON.parse(out.text).pages[pageIndex('overview')].layout[itemIndex('overview','w-111-by-channel')].widget.spec.widgetType).toBe('line');
 expect(out.issues.map(i=>[i.code,i.classification])).toEqual([['LAKEVIEW_EXPORT_SYNTHESIZED','synthesized']]);
 expect(out.issues[0]!.path).toBe('/modules/'+doc.modules.findIndex(m=>m.id==='overview')+'/elements/'+doc.modules.find(m=>m.id==='overview')!.elements.findIndex(e=>e.id==='w-111-by-channel')+'/extensions/umf.dashboard');
 // The rebuilt widget keeps its native name, so untouched widgets still resolve it, and it re-imports as the edited declaration.
 const again=importLakeviewDashboard(out.text,{id:'again',namespace:'marketing'}).document;
 expect(neutral(again,'overview','w-111-by-channel')).toMatchObject({chart:'line',title:neutral(doc,'overview','w-111-by-channel').title});
 const dataset=edit(load(),'data','ds_rank',v=>{v.title='Rank';v.source.query.text='SELECT 1\nFROM t';});
 const ds=JSON.parse(source).datasets.findIndex((d:any)=>d.name==='ds_rank');
 const lakeview=JSON.parse(source).datasets[ds];
 expect(changed(exportNeutralToLakeview(dataset).text).every(p=>p.startsWith('/datasets/'+ds+'/'))).toBe(true);
 expect(JSON.parse(exportNeutralToLakeview(dataset).text).datasets[ds]).toMatchObject({displayName:'Rank',name:lakeview.name,...(lakeview.queryLines?{queryLines:['SELECT 1\n','FROM t']}:{query:'SELECT 1\nFROM t'})});
 const theme=copyJson(load() as any) as Document;(theme.extensions!['umf.dashboard'] as any).theme.palette=['#112233','#445566'];
 expect(changed(exportNeutralToLakeview(theme).text)).toEqual(['/uiSettings/theme/visualizationColors/0','/uiSettings/theme/visualizationColors/1','/uiSettings/theme/visualizationColors/2','/uiSettings/theme/visualizationColors/3','/uiSettings/theme/visualizationColors/4']);
});
test('@covers US-094-AC5: neutral-only items are added to a retained dashboard, and invalid or non-dashboard documents are refused',()=>{
 const doc=copyJson(load() as any) as Document;
 doc.modules.find(m=>m.id==='filters')!.elements.push({id:'filter-new',extensions:{'umf.dashboard':{kind:'filter',title:'Source',control:'multi-select',targets:[{dataset:{module:'data',element:'ds_metric'},field:'source'}],position:{x:0,y:6,width:4,height:2}}}} as any);
 const out=exportNeutralToLakeview(doc),page=JSON.parse(out.text).pages[pageIndex('filters')],before=JSON.parse(source).pages[pageIndex('filters')];
 expect(page.layout.slice(0,-1)).toEqual(before.layout);expect(page.layout.at(-1).widget).toMatchObject({name:'filter-new',spec:{widgetType:'filter-multi-select'}});
 expect(changed(out.text).every(p=>p.startsWith('/pages/'+pageIndex('filters')+'/layout/'))).toBe(true);
 expect(out.issues.map(i=>i.code)).toEqual(['LAKEVIEW_EXPORT_SYNTHESIZED']);
 const broken=edit(load(),'overview','w-111-by-channel',v=>{v.encodings[0].field='missing';});
 expect(()=>exportNeutralToLakeview(broken)).toThrow(/DASHBOARD_FIELD/);
 expect(()=>exportNeutralToLakeview({...(load() as any),vocabularies:{}} as Document)).toThrow();
});
