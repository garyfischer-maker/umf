// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportNeutralDashboard,readDocument,writeDocument,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=()=>importLakeviewDashboard(source,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const element=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!;
const neutral=(doc:Document,module:string,id:string)=>element(doc,module,id).extensions['umf.dashboard'] as any;
const flatten=(value:any,path='',out:Record<string,string>={}):Record<string,string>=>{
 if(value!==null&&typeof value==='object')for(const [k,v] of Object.entries(value))flatten(v,path+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1'),out);else out[path]=JSON.stringify(value);
 return out;
};
// JSON Pointers whose leaf differs between two native dashboards.
const changed=(a:string,b:string)=>{const x=flatten(JSON.parse(a)),y=flatten(JSON.parse(b));return [...new Set([...Object.keys(x),...Object.keys(y)])].filter(k=>x[k]!==y[k]).sort();};
const strip=(doc:Document)=>{
 const bare=copyJson(doc) as unknown as Document;
 delete bare.extensions!['umf.lakeview'];delete bare.vocabularies['umf.lakeview'];
 for(const m of bare.modules){delete m.extensions!['umf.lakeview'];m.elements=m.elements.filter(e=>{delete e.extensions['umf.lakeview'];return e.extensions['umf.dashboard'];});}
 return bare;
};
const project=(text:string)=>importLakeviewDashboard(text,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const declaration=(doc:Document)=>JSON.stringify([doc.extensions!['umf.dashboard'],doc.modules.map(m=>[m.id,m.extensions!['umf.dashboard'],m.elements.map(e=>[e.id,e.extensions['umf.dashboard']])])]);
test('@covers US-094-AC1: an unedited import exports the source tokens, directly and after a UMF JSON/YAML round trip',()=>{
 const document=load(),result=exportNeutralDashboard(document);
 expect(result.text).toBe(compact(source));
 for(const format of ['json','yaml'] as const)expect(exportNeutralDashboard(readDocument(writeDocument(document,format),format)).text).toBe(compact(source));
 expect(result.issues.map(i=>[i.code,i.classification])).toEqual([['LAKEVIEW_EXPORT_UNMAPPED','annotation-only']]);
},60_000);
test('@covers US-094-AC2: edited titles, filter targets and page titles change only the corresponding native members',()=>{
 const document=load();
 neutral(document,'overview','w-111-by-channel').title='Performance by Medium';
 neutral(document,'filters','filter-channel').targets[0].field='source';
 neutral(document,'filters','filter-channel').title='Medium';
 (document.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any).title='Campaigns';
 const result=exportNeutralDashboard(document);
 const original=compact(source),pages=JSON.parse(original).pages;
 const at=(name:string)=>{const p=pages.findIndex((x:any)=>x.layout.some((l:any)=>l.widget.name===name));return '/pages/'+p+'/layout/'+pages[p].layout.findIndex((l:any)=>l.widget.name===name)+'/widget';};
 expect(changed(original,result.text)).toEqual([
  '/pages/1/displayName',
  at('filter-channel')+'/queries/0/query/fields/0/expression',
  at('filter-channel')+'/queries/0/query/fields/0/name',
  at('filter-channel')+'/spec/encodings/fields/0/fieldName',
  at('filter-channel')+'/spec/frame/title',
  at('w-111-by-channel')+'/spec/frame/title'
 ].sort());
 expect(result.issues.map(i=>i.code)).toEqual(['LAKEVIEW_EXPORT_UNMAPPED']);
 const again=project(result.text);
 expect(neutral(again,'overview','w-111-by-channel').title).toBe('Performance by Medium');
 expect(neutral(again,'filters','filter-channel').targets[0].field).toBe('source');
 expect((again.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any).title).toBe('Campaigns');
},60_000);
test('@covers US-094-AC3: a document with no umf.lakeview payloads exports a dashboard that re-imports to an equivalent declaration, with its assumptions reported',()=>{
 const bare=strip(load()),result=exportNeutralDashboard(bare);
 const again=project(result.text);
 expect(declaration(again)).toBe(declaration(bare));
 const synthesized=result.issues.filter(i=>i.code==='LAKEVIEW_EXPORT_SYNTHESIZED');
 const units=bare.modules.reduce((n,m)=>n+m.elements.length+((m.extensions!['umf.dashboard'] as any).kind==='page'?1:0),0);
 expect(synthesized.filter(i=>i.path!=='').length).toBe(units);
 expect(synthesized.filter(i=>i.path==='').length).toBe(1);
 const view=JSON.parse(result.text);
 for(const issue of synthesized.filter(i=>i.path!=='')){let node:any=view;for(const key of issue.path.split('/').slice(1))node=node[key];expect(node).toBeDefined();expect(issue.detail).toContain('Assumed:');}
 expect(synthesized.some(i=>i.path==='/pages/0'&&i.detail.includes('GRID_V1'))).toBe(true);
 expect(synthesized.some(i=>i.path.startsWith('/pages/0/layout/')&&i.detail.includes('Spec version 3'))).toBe(true);
 // Neutral members with no native counterpart are reported rather than dropped.
 const rich=strip(load());
 neutral(rich,'data','ds_campaign').fields.channel.title='Channel';
 neutral(rich,'overview','ov-header').content.format='plain';
 const reported=exportNeutralDashboard(rich).issues.filter(i=>i.code==='LAKEVIEW_EXPORT_UNMAPPED'&&i.classification==='unsupported');
 expect(reported.map(i=>i.path)).toContain('/datasets/1');
 expect(reported.find(i=>i.path==='/datasets/1')!.detail).toContain('/fields/channel/title');
 expect(reported.some(i=>i.detail.includes('/content/format'))).toBe(true);
},60_000);
test('@covers US-094-AC4: an edit a patch cannot express replaces the retained widget, reports what was not carried over, and an invalid document is refused',()=>{
 const document=load();
 const visual=neutral(document,'overview','w-111-by-channel');visual.encodings[1].aggregation='none';
 neutral(document,'overview','w-110-weekly-trend').encodings[0].title='Week';
 const result=exportNeutralDashboard(document);
 const replaced=result.issues.filter(i=>i.code==='LAKEVIEW_EXPORT_SYNTHESIZED');
 expect(replaced.map(i=>i.path)).toEqual(expect.arrayContaining([expect.stringMatching(/^\/pages\/0\/layout\/\d+$/)]));
 expect(replaced.every(i=>i.detail.includes('replaced')&&i.detail.includes('native members not carried over'))).toBe(true);
 expect(replaced.some(i=>i.detail.includes('/widget/spec/frame/showTitle')||i.detail.includes('/widget/queries/0/query/orders'))).toBe(true);
 expect(neutral(project(result.text),'overview','w-111-by-channel').encodings[1].aggregation).toBe('none');
 expect(changed(compact(source),result.text).every(p=>p.startsWith('/pages/0/layout/'))).toBe(true);
 const broken=copyJson(document) as unknown as Document;
 neutral(broken,'overview','w-111-by-channel').encodings=[];
 expect(()=>exportNeutralDashboard(broken)).toThrow();
 const unversioned=copyJson(document) as unknown as Document;delete unversioned.vocabularies['umf.dashboard'];
 expect(()=>exportNeutralDashboard(unversioned)).toThrow();
},60_000);
