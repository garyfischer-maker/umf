// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportLakeviewDashboard,exportLakeviewFromNeutral,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const authored=await Bun.file('fixtures/dashboard/marketing-campaign.json').json() as Document;
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=()=>importLakeviewDashboard(source,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'}).document;
const element=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!;
const neutral=(doc:Document,module:string,id:string)=>element(doc,module,id).extensions['umf.dashboard'] as any;
const edit=(change:(doc:Document)=>void)=>{const doc=copyJson(load()) as unknown as Document;change(doc);return doc;};
const members=(a:any,b:any,path=''):string[]=>{
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b?[]:[path];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>members(a[k],b[k],path+'/'+k));
};
test('@covers US-094-AC1: an unedited import exports the source tokens with nothing to report',()=>{
 const doc=load(),{text,issues}=exportLakeviewFromNeutral(doc);
 expect(text).toBe(compact(source));expect(text).toBe(exportLakeviewDashboard(doc));expect(issues).toEqual([]);
},60_000);
test('@covers US-094-AC2: editing a title, a filter target and a page title changes only the corresponding native members',()=>{
 const doc=edit(d=>{
  neutral(d,'overview','w-111-by-channel').title='Channels, renamed';
  neutral(d,'filters','filter-channel').targets[0].field='source';
  d.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard']=({...(d.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any),title:'Details, renamed'});
 });
 const {text,issues}=exportLakeviewFromNeutral(doc),before=JSON.parse(source),after=JSON.parse(text);
 const changed=members(before,after);
 expect(changed.filter(p=>!p.startsWith('/pages/'))).toEqual([]);
 const title=before.pages[0].layout.findIndex((l:any)=>l.widget.name==='w-111-by-channel');
 expect(after.pages[0].layout[title].widget.spec.frame.title).toBe('Channels, renamed');
 expect(after.pages[1].displayName).toBe('Details, renamed');
 const filterIndex=before.pages[2].layout.findIndex((l:any)=>l.widget.name==='filter-channel');
 expect(changed.filter(p=>p.startsWith('/pages/2/layout/'+filterIndex+'/'))).toEqual(expect.arrayContaining([expect.stringContaining('expression')]));
 expect(changed.filter(p=>!p.startsWith('/pages/2/')&&!p.startsWith('/pages/0/layout/'+title+'/')&&p!=='/pages/1/displayName')).toEqual([]);
 expect(issues.filter(i=>i.code==='LAKEVIEW_EXPORT_UNSYNCED').map(i=>i.path)).toEqual([]);
 // Number tokens elsewhere are untouched.
 expect(text.includes('"decimalPlaces":{"type":"max","places":1}')).toBe(true);
},60_000);
test('@covers US-094-AC2: a neutral edit with no native rule is reported and the native member is kept',()=>{
 const doc=edit(d=>{neutral(d,'overview','w-111-by-channel').chart='line';});
 const {text,issues}=exportLakeviewFromNeutral(doc);
 expect(text).toBe(compact(source));
 expect(issues).toEqual([expect.objectContaining({code:'LAKEVIEW_EXPORT_UNSYNCED',detail:expect.stringContaining('chart')})]);
},60_000);
test('@covers US-094-AC3: a document with no native payloads exports a dashboard that re-imports to an equivalent declaration',()=>{
 const input=copyJson(authored) as unknown as Document;
 const {text,issues}=exportLakeviewFromNeutral(input);
 const back=importLakeviewDashboard(text,{id:input.id,title:'x'}).document;
 const shape=(doc:Document)=>Object.fromEntries(doc.modules.flatMap(m=>m.elements.map(e=>{
  const n=e.extensions['umf.dashboard'] as any;if(!n)return [];
  const {trace:_t,...rest}=n;
  return [[m.id==='data'||n.kind==='dataset'?'data/'+e.id:m.id+'/'+e.id,n.kind==='visual'?{...rest,dataset:rest.dataset.element}:n.kind==='filter'?{...rest,targets:rest.targets.map((t:any)=>[t.dataset.element,t.field])}:rest]];
 }).filter(x=>x.length)));
 const was=shape(input),now=shape(back);
 expect(Object.keys(now).sort()).toEqual(Object.keys(was).sort());
 // Visuals, text and filters survive exactly; only dataset grain and column metadata are lost, and each is reported.
 for(const key of Object.keys(was))if(!key.startsWith('data/'))expect(members(was[key],now[key])).toEqual([]);
 const datasetPaths=issues.filter(i=>i.code==='LAKEVIEW_EXPORT_UNSUPPORTED').map(i=>i.path);
 for(const [mi,m] of input.modules.entries())for(const [ei,e] of m.elements.entries()){const k='data/'+e.id;if(was[k]&&members(was[k],now[k]).length)expect(datasetPaths).toContain('/modules/'+mi+'/elements/'+ei);}
 expect(members((back.extensions!['umf.dashboard'] as any).pages,(input.extensions!['umf.dashboard'] as any).pages)).toEqual([]);
 expect(members((back.extensions!['umf.dashboard'] as any).layout,(input.extensions!['umf.dashboard'] as any).layout)).toEqual([]);
 expect(members((back.extensions!['umf.dashboard'] as any).theme?.palette,(input.extensions!['umf.dashboard'] as any).theme?.palette)).toEqual([]);
 expect(issues.some(i=>i.code==='LAKEVIEW_EXPORT_ASSUMPTION')).toBe(true);
 expect(exportLakeviewDashboard(back)).toBe(compact(text));
},120_000);
test('@covers US-094-AC4: elements added to a retained dashboard are synthesized and the rest stays exact',()=>{
 const doc=edit(d=>{
  const page=d.modules.find(m=>m.id==='overview')!;
  page.elements.push({id:'w-note',extensions:{'umf.dashboard':{kind:'text',content:{format:'markdown',text:'## Added\nby neutral edit'},position:{x:0,y:40,width:12,height:2}}}} as any);
 });
 const {text}=exportLakeviewFromNeutral(doc),before=JSON.parse(source),after=JSON.parse(text);
 expect(after.pages[0].layout.length).toBe(before.pages[0].layout.length+1);
 expect(after.pages[0].layout.at(-1)).toEqual({widget:{name:'w-note',multilineTextboxSpec:{lines:['## Added\n','by neutral edit']}},position:{x:0,y:40,width:12,height:2}});
 expect(members({...before,pages:before.pages.map((p:any,i:number)=>i?p:{...p,layout:p.layout})},{...after,pages:after.pages.map((p:any,i:number)=>i?p:{...p,layout:p.layout.slice(0,-1)})})).toEqual([]);
 expect(()=>exportLakeviewFromNeutral(edit(d=>{neutral(d,'overview','w-111-by-channel').encodings=[];}))).toThrow();
},60_000);
