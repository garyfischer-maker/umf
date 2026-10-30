// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportNeutralDashboard,exportLakeviewDashboard,inspectDashboard,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const authored=await Bun.file('fixtures/dashboard/marketing-campaign.json').json() as Document;
const compact=renderTree(parseNativeJson(source));
const load=()=>importLakeviewDashboard(source,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const element=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!;
const neutral=(doc:Document,module:string,id:string)=>element(doc,module,id).extensions['umf.dashboard'] as any;
/** JSON Pointers whose values differ between two parsed documents. */
function diff(a:any,b:any,path=''):string[]{
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&(Array.isArray(a)?a.length===b.length:true))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],path+'/'+k));
 return [path];
}
test('@covers US-094-AC1: an unedited import exports the source tokens with no issues',()=>{
 const result=exportNeutralDashboard(load());
 expect(result.text).toBe(compact);expect(result.issues).toEqual([]);
 expect(result.text).toBe(exportLakeviewDashboard(load()));
});
test('@covers US-094-AC2: editing a visual title, a filter target and a page title changes only those native members',()=>{
 const doc=load(),visual=neutral(doc,'overview','w-102-clicks');
 visual.title='Clicks (edited)';
 const filter=neutral(doc,'filters','filter-metric');
 const alternative=Object.entries<any>(neutral(doc,'data','ds_metric').fields).find(([name,f])=>f.role==='column'&&name!==filter.targets[0].field)![0];
 filter.targets[0].field=alternative;
 (doc.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any).title='Details (edited)';
 expect(inspectDashboard(doc).valid).toBe(true);
 const {text,issues}=exportNeutralDashboard(doc),before=JSON.parse(source),after=JSON.parse(text);
 const changes=diff(before,after);
 const clicks=before.pages[0].layout.findIndex((l:any)=>l.widget.name==='w-102-clicks'),fi=before.pages[2].layout.findIndex((l:any)=>l.widget.name==='filter-metric');
 expect([...changes].sort()).toEqual([
  '/pages/0/layout/'+clicks+'/widget/spec/frame/title',
  '/pages/1/displayName',
  '/pages/2/layout/'+fi+'/widget/queries/0/query/fields/0/name',
  '/pages/2/layout/'+fi+'/widget/queries/0/query/fields/0/expression',
  '/pages/2/layout/'+fi+'/widget/spec/encodings/fields/0/fieldName',
 ].sort());
 expect(after.pages[0].layout[clicks].widget.spec.frame.title).toBe('Clicks (edited)');
 expect(after.pages[1].displayName).toBe('Details (edited)');
 expect(after.pages[2].layout[fi].widget.queries[0].query.fields[0].expression).toBe('`'+alternative+'`');
 expect(issues).toEqual([]);
 // Only member values changed: every unchanged token and the member order are preserved.
 expect(Object.keys(after)).toEqual(Object.keys(before));
 const reimported=importLakeviewDashboard(text,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
 expect(neutral(reimported,'overview','w-102-clicks').title).toBe('Clicks (edited)');
 expect(neutral(reimported,'filters','filter-metric').targets[0].field).toBe(alternative);
});
test('@covers US-094-AC3: a document without lakeview payloads exports a dashboard that re-imports equivalently',()=>{
 const {text,issues}=exportNeutralDashboard(copyJson(authored as any) as Document);
 expect(issues.some(i=>i.code==='LAKEVIEW_EXPORT_ASSUMPTION')).toBe(true);
 const back=importLakeviewDashboard(text,{id:authored.id,title:(authored.extensions!['umf.dashboard'] as any).title,namespace:'marketing'});
 expect(inspectDashboard(back.document).valid).toBe(true);
 const shape=(e:any)=>({channel:e.channel,field:e.field,aggregation:e.aggregation,scale:e.scale,sort:e.sort,title:e.title,format:e.format});
 const mine=(back.document.extensions!['umf.dashboard'] as any),want=(authored.extensions!['umf.dashboard'] as any);
 expect(mine.pages).toEqual(want.pages);expect(mine.theme).toMatchObject(want.theme);
 for(const module of authored.modules)for(const item of module.elements){
  const expected=item.extensions['umf.dashboard'] as any,actual=neutral(back.document,module.id,item.id);
  expect(actual.kind).toBe(expected.kind);
  if(expected.kind==='visual'){expect([actual.title,actual.chart,actual.dataset,actual.rows,actual.position]).toEqual([expected.title,expected.chart,expected.dataset,expected.rows,expected.position]);expect(actual.encodings.map((e:any)=>shape(e))).toEqual(expected.encodings.filter((e:any)=>e.channel!=='detail').map(shape));}
  if(expected.kind==='filter')expect([actual.control,actual.default,actual.targets,actual.position]).toEqual([expected.control,expected.default,expected.targets,expected.position]);
  if(expected.kind==='text')expect(actual.content.text).toBe(expected.content.text);
  if(expected.kind==='dataset')for(const [name,field] of Object.entries<any>(expected.fields))if(field.role==='measure')expect(actual.fields[name].expression).toEqual(field.expression);
 }
});
test('@covers US-094-AC4: non member-level edits regenerate the widget with a report and unapplied edits are reported',()=>{
 const doc=load(),visual=neutral(doc,'campaign_details','w-206-campaign-detail');
 visual.encodings=visual.encodings.map((e:any)=>e.channel==='column'?{...e,title:'Renamed'}:e);
 const page=doc.modules.find(m=>m.id==='filters')!.extensions!['umf.dashboard'] as any;page.role='canvas';
 const root=doc.extensions!['umf.dashboard'] as any;root.theme={...root.theme,palette:['#112233']};
 const {text,issues}=exportNeutralDashboard(doc);
 expect(issues.map(i=>i.code).sort()).toEqual(['LAKEVIEW_EXPORT_ASSUMPTION','LAKEVIEW_EXPORT_RESYNTHESIZED','LAKEVIEW_EXPORT_UNAPPLIED','LAKEVIEW_EXPORT_UNAPPLIED']);
 const resynth=issues.find(i=>i.code==='LAKEVIEW_EXPORT_RESYNTHESIZED')!;
 expect(resynth.path).toMatch(/^\/pages\/1\/layout\/\d+$/);expect(resynth.detail).toContain('no longer present');
 expect(JSON.parse(text).pages[2].pageType).toBe('PAGE_TYPE_GLOBAL_FILTERS');
 expect(JSON.parse(text).uiSettings.theme.visualizationColors).toEqual(JSON.parse(source).uiSettings.theme.visualizationColors);
 expect(inspectDashboard(doc).valid).toBe(true);
});
