// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importLakeviewDashboard,exportNeutralLakeviewDashboard,exportLakeviewDashboard,inspectDashboard,readDocument,writeDocument,copyJson,type Document} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
const source=await Bun.file('fixtures/lakeview/marketing-campaign.lvdash.json').text();
const compact=(text:string)=>renderTree(parseNativeJson(text));
const load=(text=source)=>importLakeviewDashboard(text,{id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'});
const clone=(doc:Document)=>copyJson(doc) as unknown as Document;
const element=(doc:Document,module:string,id:string)=>doc.modules.find(m=>m.id===module)!.elements.find(e=>e.id===id)!;
const neutral=(doc:Document,module:string,id:string)=>element(doc,module,id).extensions['umf.dashboard'] as any;
const stripNative=(doc:Document)=>{const bare=clone(doc);delete bare.extensions!['umf.lakeview'];delete bare.vocabularies['umf.lakeview'];for(const m of bare.modules){delete m.extensions!['umf.lakeview'];for(const e of m.elements)delete e.extensions['umf.lakeview'];}return bare;};
/** Paths (JSON Pointers) at which two JSON values differ; arrays and objects are compared member by member. */
function diff(a:any,b:any,path=''):string[]{
 if(a===b)return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
  const keys=new Set([...Object.keys(a),...Object.keys(b)]);return [...keys].flatMap(k=>diff(a[k],b[k],path+'/'+k));
 }
 return [path];
}
const changed=(text:string)=>diff(JSON.parse(source),JSON.parse(text));
test('@covers US-094-AC1: an unedited import exports to the source tokens, directly and after a UMF JSON/YAML round trip',()=>{
 const {document}=load();
 const direct=exportNeutralLakeviewDashboard(document);
 expect(direct.text).toBe(compact(source));expect(direct.issues).toEqual([]);
 for(const format of ['json','yaml'] as const)expect(exportNeutralLakeviewDashboard(readDocument(writeDocument(document,format),format)).text).toBe(compact(source));
 expect(exportNeutralLakeviewDashboard(document).text).toBe(exportLakeviewDashboard(document));
});
test('@covers US-094-AC2: editing a visual title, a filter target and a page title changes only the matching native members',()=>{
 const {document}=load(),edited=clone(document);
 neutral(edited,'overview','w-101-impressions').title='Total impressions';
 const target=neutral(edited,'filters','filter-week-end').targets[0],dataset=neutral(edited,target.dataset.module,target.dataset.element);
 const other=Object.keys(dataset.fields).find(k=>dataset.fields[k].role==='column'&&k!==target.field)!;
 target.field=other;
 edited.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard']={...(edited.modules.find(m=>m.id==='campaign_details')!.extensions!['umf.dashboard'] as any),title:'Campaigns'};
 const out=exportNeutralLakeviewDashboard(edited),paths=changed(out.text);
 expect(out.issues).toEqual([]);
 const view=JSON.parse(source),pi=view.pages.findIndex((p:any)=>p.name==='overview'),ci=view.pages.findIndex((p:any)=>p.name==='campaign_details'),fi=view.pages.findIndex((p:any)=>p.name==='filters');
 const filter=view.pages[fi].layout.findIndex((l:any)=>l.widget.name==='filter-week-end'),w=view.pages[fi].layout[filter].widget;
 const field=w.spec.encodings.fields[0],query=w.queries.find((q:any)=>q.name===field.queryName),qi=w.queries.indexOf(query),fieldIndex=query.query.fields.findIndex((f:any)=>f.name===field.fieldName);
 const base='/pages/'+fi+'/layout/'+filter+'/widget/queries/'+qi+'/query';
 expect(paths.filter(p=>!p.endsWith('/datasetName')).sort()).toEqual([
  '/pages/'+pi+'/layout/1/widget/spec/frame/title','/pages/'+ci+'/displayName',base+'/fields/'+fieldIndex+'/expression'].sort());
 expect(JSON.parse(out.text).pages[pi].layout[1].widget.spec.frame.title).toBe('Total impressions');
 expect(JSON.parse(out.text).pages[ci].displayName).toBe('Campaigns');
 expect(JSON.parse(out.text).pages[fi].layout[filter].widget.queries[qi].query.fields[fieldIndex].expression).toBe('`'+other+'`');
 // Edited neutral content re-imports to the edited neutral declaration.
 const back=load(out.text).document;
 expect(neutral(back,'overview','w-101-impressions').title).toBe('Total impressions');
 expect(neutral(back,'filters','filter-week-end').targets[0].field).toBe(other);
 // A moved visual and an edited text box change only their own members.
 const moved=clone(document),overview=moved.modules.find(m=>m.id==='overview')!;const text=overview.elements.find(e=>(e.extensions['umf.dashboard'] as any)?.kind==='text')!;
 neutral(moved,'overview','w-101-impressions').position.y+=1;(text.extensions['umf.dashboard'] as any).content.text='Edited note';
 const movedOut=exportNeutralLakeviewDashboard(moved);expect(movedOut.issues).toEqual([]);
 const textIndex=overview.elements.indexOf(text),textWidget=view.pages[pi].layout[textIndex].widget;
 const textPath='/pages/'+pi+'/layout/'+textIndex+'/widget/'+(textWidget.multilineTextboxSpec?'multilineTextboxSpec/lines/':'textbox_spec');
 const movedPaths=changed(movedOut.text);
 expect(movedPaths).toContain('/pages/'+pi+'/layout/1/position/y');
 expect(movedPaths.filter(p=>p!=='/pages/'+pi+'/layout/1/position/y').every(p=>p.startsWith(textPath))).toBe(true);
 expect(JSON.parse(movedOut.text).pages[pi].layout[textIndex].widget.multilineTextboxSpec.lines.join('')).toBe('Edited note');
});
test('@covers US-094-AC3: a document with no native payloads exports a synthesized dashboard that re-imports to an equivalent declaration',()=>{
 const {document}=load(),bare=stripNative(document);
 const out=exportNeutralLakeviewDashboard(bare);
 expect(out.issues.every(i=>i.classification==='representation-change'&&i.code==='LAKEVIEW_EXPORT_ASSUMPTION')).toBe(true);
 expect(out.issues.map(i=>i.path)).toContain('');
 expect(out.issues.filter(i=>i.path==='').map(i=>i.detail).join('\n')).toContain('spec versions');
 const again=load(out.text);
 expect(again.issues).toEqual([]);expect(inspectDashboard(again.document).valid).toBe(true);
 expect(again.document.extensions!['umf.dashboard']).toEqual(document.extensions!['umf.dashboard']);
 for(const module of document.modules){
  const mine=again.document.modules.find(m=>m.id===module.id)!;
  expect(mine.extensions!['umf.dashboard']).toEqual(module.extensions!['umf.dashboard']);
  for(const e of module.elements)expect(neutral(again.document,module.id,e.id)).toEqual(e.extensions['umf.dashboard']);
 }
 // Items added to an imported document are synthesized beside the retained ones.
 const grown=clone(document);
 grown.modules.find(m=>m.id==='overview')!.elements.push({id:'w-new-note',extensions:{'umf.dashboard':{kind:'text',content:{format:'markdown',text:'Added\nnote'},position:{x:0,y:99,width:12,height:2}}}} as any);
 const grownOut=exportNeutralLakeviewDashboard(grown),pi=JSON.parse(source).pages.findIndex((p:any)=>p.name==='overview');
 expect(changed(grownOut.text).every(p=>p.startsWith('/pages/'+pi+'/layout/'))).toBe(true);
 expect(JSON.parse(grownOut.text).pages[pi].layout.at(-1)).toEqual({widget:{name:'w-new-note',multilineTextboxSpec:{lines:['Added\n','note']}},position:{x:0,y:99,width:12,height:2}});
 expect(neutral(load(grownOut.text).document,'overview','w-new-note').content.text).toBe('Added\nnote');
});
test('@covers US-094-AC4: unwritable edits are reported and keep native content, unexpressed members are reported, removals apply and invalid documents are refused',()=>{
 const {document}=load(),edited=clone(document);
 neutral(edited,'overview','w-101-impressions').encodings[0].title='Renamed';
 neutral(edited,'filters','filter-week-end').targets.pop();
 const out=exportNeutralLakeviewDashboard(edited);
 expect(out.text).toBe(compact(source));
 expect(out.issues.map(i=>i.code)).toEqual(['LAKEVIEW_EXPORT_EDIT','LAKEVIEW_EXPORT_EDIT'].slice(0,out.issues.length));
 expect(out.issues.find(i=>i.detail.includes('"encodings"'))?.classification).toBe('unsupported');
 expect(out.issues.every(i=>i.classification==='unsupported')).toBe(true);
 const unknown=stripNative(document);
 const bar=neutral(unknown,'overview','w-111-by-channel');
 bar.futureFlag=true;bar.encodings.push({...bar.encodings[0],channel:'detail'});
 const unknownOut=exportNeutralLakeviewDashboard(unknown);
 const unexpressed=unknownOut.issues.filter(i=>i.code==='LAKEVIEW_EXPORT_UNEXPRESSED');
 expect(unexpressed.map(i=>i.detail).join('\n')).toContain('futureFlag');
 expect(unexpressed.map(i=>i.detail).join('\n')).toContain('"detail"');
 const removed=clone(document),overview=removed.modules.find(m=>m.id==='overview')!;overview.elements.splice(1,1);
 const removedOut=exportNeutralLakeviewDashboard(removed);
 expect(JSON.parse(removedOut.text).pages.find((p:any)=>p.name==='overview').layout.length).toBe(JSON.parse(source).pages.find((p:any)=>p.name==='overview').layout.length-1);
 const broken=clone(document);neutral(broken,'overview','w-101-impressions').dataset={module:'data',element:'missing'};
 expect(()=>exportNeutralLakeviewDashboard(broken)).toThrow();
 const bad=stripNative(document);neutral(bad,'overview','w-101-impressions').chart='nonsense';
 expect(()=>exportNeutralLakeviewDashboard(bad)).toThrow();
});
