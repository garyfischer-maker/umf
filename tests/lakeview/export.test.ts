// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportLakeviewDashboard,exportNeutralToLakeview,inspectDashboard,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=()=>importLakeviewDashboard(source,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const edit=(change:(doc:Document)=>void)=>{const doc=copyJson(load()) as unknown as Document;change(doc);return doc;};
const neutral=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!.extensions['umf.dashboard'] as any;
const pageNeutral=(doc:Document,module:string)=>doc.modules.find(m=>m.id===module)!.extensions!['umf.dashboard'] as any;
/** Members that differ between two JSON values, as JSON Pointers. */
function diff(a:any,b:any,path=''):string[]{
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&(!Array.isArray(a)||a.length===b.length))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],path+'/'+k));
 return [path];
}
const exported=(doc:Document)=>JSON.parse(exportNeutralToLakeview(doc).text);
test('@covers US-094-AC1: an unedited import exports to the source tokens with no reported assumptions',()=>{
 const result=exportNeutralToLakeview(load());
 expect(result.text).toBe(compact(source));
 expect(result.issues).toEqual([]);
});
test('@covers US-094-AC2: editing a title, a filter target and a page title changes only the corresponding native members',()=>{
 const view=JSON.parse(source),pi=view.pages.findIndex((p:any)=>p.name==='overview'),fi=view.pages.findIndex((p:any)=>p.name==='filters');
 const li=(p:number,name:string)=>view.pages[p].layout.findIndex((l:any)=>l.widget.name===name);
 const title=edit(d=>{neutral(d,'overview','w-111-by-channel').title='Channels, ranked';});
 expect(diff(view,exported(title))).toEqual(['/pages/'+pi+'/layout/'+li(pi,'w-111-by-channel')+'/widget/spec/frame/title']);
 const target=edit(d=>{const f=neutral(d,'filters','filter-channel');f.targets=[f.targets[0]];});
 const changed=diff(view,exported(target));
 expect(changed.length).toBeGreaterThan(0);
 expect(changed.every(p=>p.startsWith('/pages/'+fi+'/layout/'+li(fi,'filter-channel')+'/widget/'))).toBe(true);
 expect(exported(target).pages[fi].layout[li(fi,'filter-channel')].widget.queries).toHaveLength(1);
 const page=edit(d=>{pageNeutral(d,'campaign_details').title='Campaigns';});
 expect(diff(view,exported(page))).toEqual(['/pages/'+view.pages.findIndex((p:any)=>p.name==='campaign_details')+'/displayName']);
 const retitled=exportNeutralToLakeview(title);
 expect(retitled.issues.some(i=>i.code==='LAKEVIEW_SYNTH_PATCH'&&i.path.endsWith('/layout/'+li(pi,'w-111-by-channel')))).toBe(true);
 const theme=edit(d=>{(d.extensions!['umf.dashboard'] as any).theme.palette=['#112233'];});
 expect(diff(view,exported(theme))).toEqual(['/uiSettings/theme/visualizationColors']);
},60_000);
test('@covers US-094-AC3: a document without umf.lakeview payloads exports a dashboard that re-imports to an equivalent declaration',()=>{
 const stripped=edit(d=>{
  const drop=(o:{extensions?:Record<string,unknown>})=>{delete o.extensions!['umf.lakeview'];};
  drop(d);for(const m of d.modules){drop(m);m.elements.forEach(drop);}
  delete (d.vocabularies as any)['umf.lakeview'];
 });
 expect(inspectDashboard(stripped).valid).toBe(true);
 const result=exportNeutralToLakeview(stripped);
 const back=importLakeviewDashboard(result.text,{id:stripped.id,title:'Marketing Campaign Performance',namespace:'marketing'}).document;
 expect(inspectDashboard(back).valid).toBe(true);
 expect(back.extensions!['umf.dashboard']).toEqual(stripped.extensions!['umf.dashboard']);
 const want=stripped.modules.filter(m=>m.extensions!['umf.dashboard']);
 expect(back.modules.map(m=>m.id)).toEqual(want.map(m=>m.id));
 for(const module of want){
  const actual=back.modules.find(m=>m.id===module.id)!;
  expect(actual.extensions!['umf.dashboard']).toEqual(module.extensions!['umf.dashboard']);
  expect(actual.elements.map(e=>e.id)).toEqual(module.elements.map(e=>e.id));
  for(const element of module.elements)expect(actual.elements.find(e=>e.id===element.id)!.extensions['umf.dashboard']).toEqual(element.extensions['umf.dashboard']);
 }
 // The synthesis states what it assumed instead of staying silent.
 expect(result.issues.map(i=>i.code)).toContain('LAKEVIEW_SYNTH_ASSUMPTION');
 expect(result.issues.every(i=>i.retainedInSource===true&&i.path.startsWith('/'))).toBe(true);
});
test('@covers US-094-AC4: unrepresentable neutral content is reported and edits that cannot be exported keep the native member',()=>{
 const unsupported=edit(d=>{const v=neutral(d,'overview','w-111-by-channel');v.encodings.push({channel:'detail',field:'channel',aggregation:'none'});v.encodings[1].format={kind:'date'};});
 const result=exportNeutralToLakeview(unsupported);
 expect(result.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['LAKEVIEW_SYNTH_ENCODING','LAKEVIEW_SYNTH_FORMAT']));
 const orphan=edit(d=>{d.modules.find(m=>m.id==='overview')!.elements.find(e=>e.id==='w-111-by-channel')!.extensions['umf.dashboard']=undefined as never;delete d.modules.find(m=>m.id==='overview')!.elements.find(e=>e.id==='w-111-by-channel')!.extensions['umf.dashboard'];});
 expect(exportNeutralToLakeview(orphan).text).toBe(compact(source));
 const legacy=JSON.parse(source);delete legacy.pages[1].layoutVersion;
 const doc=importLakeviewDashboard(JSON.stringify(legacy),{id:'d',title:'t'}).document;
 (doc.modules.find(m=>m.id==='campaign_details')!.elements.find(e=>e.id==='w-201-campaigns-run')!.extensions['umf.dashboard'] as any).title='Changed';
 const grid=exportNeutralToLakeview(doc);
 expect(grid.issues.map(i=>[i.code,i.path])).toContainEqual(['LAKEVIEW_SYNTH_GRID','/pages/1/layout/1']);
 expect(grid.text).toBe(compact(JSON.stringify(legacy)));
 const bad=edit(d=>{(d.extensions!['umf.dashboard'] as any).layout.columns=24;});
 expect(()=>exportNeutralToLakeview(bad)).toThrow('6 or 12 columns');
 const noNeutral=edit(d=>{delete d.extensions!['umf.dashboard'];});
 expect(()=>exportNeutralToLakeview(noNeutral)).toThrow();
},60_000);
