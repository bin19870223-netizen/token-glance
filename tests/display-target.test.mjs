import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{displayIdentity,resolveDisplay}=require('../src/display-target.cjs'),{sanitizeSettings,resetSettings}=require('../src/model.cjs');
const primary={id:1,label:'Primary',internal:false,bounds:{x:0,y:0,width:2560,height:1440}};
const secondary={id:2,label:'LG HDR 4K',internal:false,bounds:{x:2560,y:-898,width:1441,height:2560}};
test('persisted monitor identity survives changed display IDs, DPI and startup ordering',()=>{
 const settings=sanitizeSettings({displayId:2,displayTarget:displayIdentity(secondary)});
 const next={...secondary,id:99,bounds:{x:2560,y:0,width:2160,height:3840}};
 assert.equal(resolveDisplay([next,primary],settings),next);
 assert.equal(resolveDisplay([{...primary,id:2},next],settings),next);
});
test('temporarily missing monitors do not become a different display with a reused ID',()=>{
 const settings=sanitizeSettings({displayId:2,displayTarget:displayIdentity(secondary)});
 assert.equal(resolveDisplay([{...primary,id:2}],settings),null);assert.equal(settings.displayTarget.label,'LG HDR 4K');
 assert.equal(resolveDisplay([primary,secondary],{displayId:2}),secondary);
});
test('identical monitor names use saved geometry and leave genuinely ambiguous choices unresolved',()=>{
 const other={...secondary,id:3,bounds:{...secondary.bounds,x:-1441}},settings={displayId:400,displayTarget:displayIdentity(secondary)};
 assert.equal(resolveDisplay([other,secondary],settings),secondary);
 assert.equal(resolveDisplay([secondary,{...secondary,id:4}],settings),null);
});
test('monitor metadata is validated and layout reset clears the remembered target',()=>{
 const settings=sanitizeSettings({displayId:2,displayTarget:displayIdentity(secondary)});assert.deepEqual(settings.displayTarget,displayIdentity(secondary));
 assert.equal(sanitizeSettings({displayTarget:{...settings.displayTarget,width:NaN}}).displayTarget,null);
 assert.equal(resetSettings(settings,'layout').displayTarget,null);assert.equal(resetSettings(settings,'appearance').displayTarget.label,'LG HDR 4K');
});
