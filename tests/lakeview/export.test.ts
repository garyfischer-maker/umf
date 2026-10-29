// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportNeutralDashboard,inspectDashboard,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=(text=source)=>importLakeviewDashboard(text,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const neutral=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!.extensions['umf.dashboard'] as any;
const edit=(doc:Document,change:(doc:Document)=>void)=>{const copy=copyJson(doc as any) as unknown as Document;change(copy);return copy;};
/** Every JSON Pointer at which two native values differ. */
function diff(a:any,b:any,path=''):string[]{
 if(a===b)return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  const out:string[]=[];for(const key of new Set([...Object.keys(a),...Object.keys(b)]))out.push(...diff(a[key],b[key],path+'/'+key));return out;
 }
 return [path];
}
const strip=(doc:Document)=>{const copy=copyJson(doc as any) as unknown as Document;delete copy.vocabularies['umf.lakeview'];delete copy.extensions!['umf.lakeview'];for(const m of copy.modules){delete m.extensions!['umf.lakeview'];for(const e of m.elements)delete e.extensions['umf.lakeview'];}return copy;};
test('@covers US-094-AC1: an unedited import exports the source tokens with every item retained',()=>{
 const result=exportNeutralDashboard(load());
 expect(result.text).toBe(compact(source));
 expect(result.issues).toEqual([]);
 expect(new Set(result.elements.map(e=>e.mode))).toEqual(new Set(['retained']));
});
test('@covers US-094-AC2: edits to a visual title, a filter target and a page title change only the matching native members',()=>{
 const doc=edit(load(),d=>{
  neutral(d,'overview','w-101-impressions').title='Total impressions';
  const filter=neutral(d,'filters','filter-week-end');filter.targets=filter.targets.slice(0,2);
  d.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard']=({...(d.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any),title:'Details'});
 });
 const before=JSON.parse(source),result=exportNeutralDashboard(doc),after=JSON.parse(result.text);
 const original=neutral(load(),'filters','filter-week-end').targets.length;expect(original).toBeGreaterThan(2);
 const changes=diff(before,after);
 const pi=before.pages.findIndex((p:any)=>p.name==='overview'),wi=before.pages[pi].layout.findIndex((l:any)=>l.widget.name==='w-101-impressions');
 expect(changes).toContain('/pages/'+pi+'/layout/'+wi+'/widget/spec/frame/title');
 expect(changes).toContain('/pages/'+before.pages.findIndex((p:any)=>p.name==='campaign_details')+'/displayName');
 expect(after.pages[pi].layout[wi].widget.spec.frame.title).toBe('Total impressions');
 const fi=before.pages.findIndex((p:any)=>p.name==='filters'),li=before.pages[fi].layout.findIndex((l:any)=>l.widget.name==='filter-week-end');
 const filterWidget=after.pages[fi].layout[li].widget;
 expect(filterWidget.spec.encodings.fields.length).toBe(2);expect(filterWidget.queries.length).toBe(2);
 expect(filterWidget.queries.map((q:any)=>q.name)).toEqual(before.pages[fi].layout[li].widget.queries.slice(0,2).map((q:any)=>q.name));
 // Nothing outside the three edited widgets or the edited page changed.
 for(const path of changes)expect(/^\/pages\/\d+\/(displayName$|layout\/\d+\/widget\/(spec\/frame\/title|spec\/encodings\/fields|queries))/.test(path)).toBe(true);
 expect(new Set(result.elements.filter(e=>e.mode!=='retained').map(e=>(e.module+'/'+(e.element??'')))))
  .toEqual(new Set(['overview/w-101-impressions','filters/filter-week-end','campaign_details/']));
 expect(result.elements.filter(e=>e.mode==='synthesized')).toEqual([]);
});
test('@covers US-094-AC3: a document with no umf.lakeview payloads exports a dashboard that re-imports to an equivalent neutral declaration',()=>{
 const original=load(),doc=strip(original),result=exportNeutralDashboard(doc);
 expect(result.elements.every(e=>e.mode==='synthesized')).toBe(true);
 const back=load(result.text);expect(inspectDashboard(back).valid).toBe(true);
 const root=(d:Document)=>d.extensions!['umf.dashboard'] as any;
 expect(root(back).pages).toEqual(root(original).pages);expect(root(back).layout).toEqual(root(original).layout);expect(root(back).theme).toEqual(root(original).theme);
 for(const module of original.modules){
  const mine=back.modules.find(m=>m.id===module.id)!;
  expect(mine.extensions!['umf.dashboard']).toEqual(module.extensions!['umf.dashboard']);
  for(const e of module.elements){
   const expected=e.extensions['umf.dashboard'] as any,actual=mine.elements.find(x=>x.id===e.id)?.extensions['umf.dashboard'] as any;
   expect(actual).toBeDefined();
   // The importer reads the neutral query text as joined lines, so line splitting must not change it.
   expect(actual).toEqual(expected);
  }
 }
 expect(result.issues.some(i=>i.code==='LAKEVIEW_EXPORT_ASSUMED')).toBe(true);
});
test('@covers US-094-AC4: edits beyond the mapped members rebuild the item and report it; unmapped members are reported, not dropped silently',()=>{
 const doc=edit(load(),d=>{
  const visual=neutral(d,'overview','w-110-weekly-trend');visual.chart='area';visual.trace='note';
  const root=d.extensions!['umf.dashboard'] as any;root.layout.columns=24;
 });
 const result=exportNeutralDashboard(doc);
 const rebuilt=result.elements.find(e=>e.element==='w-110-weekly-trend')!;
 expect(rebuilt.mode).toBe('synthesized');expect(rebuilt.changed).toContain('chart');
 expect(result.issues.some(i=>i.code==='LAKEVIEW_EXPORT_RESYNTHESIZED'&&i.path.endsWith('/layout/6'))).toBe(true);
 expect(result.issues.some(i=>i.code==='LAKEVIEW_EXPORT_UNMAPPED'&&i.path===''&&i.detail.includes('layout'))).toBe(true);
 expect(result.issues.some(i=>i.code==='LAKEVIEW_EXPORT_UNMAPPED'&&i.detail.startsWith('Trace'))).toBe(true);
 expect(exportNeutralDashboard(strip(load())).issues.some(i=>i.code==='LAKEVIEW_EXPORT_UNMAPPED'&&i.detail.startsWith('Dashboard title'))).toBe(true);
 const after=JSON.parse(result.text),widget=after.pages[0].layout.find((l:any)=>l.widget.name==='w-110-weekly-trend').widget;
 expect(widget.spec.widgetType).toBe('area');
 // A document without its dashboard declaration or with an invalid one is refused.
 expect(()=>exportNeutralDashboard(edit(load(),d=>{delete d.extensions!['umf.dashboard'];}))).toThrow();
 expect(()=>exportNeutralDashboard(edit(load(),d=>{neutral(d,'overview','w-101-impressions').position.x=99;}))).toThrow();
});
