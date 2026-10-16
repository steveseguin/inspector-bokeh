const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.argv[2] || require('node:path').join(__dirname, '../demo/demo.js'), 'utf8');
function setup() {
  const nodes = {}, readers = [], images = [], workers = [], errors = [];
  let drawn;
  const context = { drawImage(img) { drawn = img; }, getImageData(x,y,width,height) { return {width,height,data:new Uint8ClampedArray(width*height*4)}; } };
  for (const selector of ['#score #value','#score #explanation','#details','.spinner','canvas','#calculation_time','#upload_image']) nodes[selector] = {innerHTML:'',style:{},getContext(){return context;},addEventListener(t,fn){this.change=fn;}};
  class FileReader { readAsDataURL(file) { this.file=file; readers.push(this); } }
  class Image { set src(id) { this.id=id; this.width=8; this.height=8; images.push(this); } }
  class Worker { constructor(){workers.push(this);} postMessage(message){this.message=message;} terminate(){this.terminated=true;} }
  vm.runInNewContext(source,{document:{querySelector:s=>nodes[s]},FileReader,Image,Worker,console:{log:(...x)=>errors.push(x),error:(...x)=>errors.push(x)},Date});
  return {nodes,readers,images,workers,errors,get drawn(){return drawn;},select(id){nodes['#upload_image'].change({target:{files:[id]}});},read(i){readers[i].onload({target:{result:readers[i].file}});},async load(i){images[i].onload();await flush();},finish(i,value){workers[i].onmessage({data:{score:{width:8,height:8,num_edges:8,avg_edge_width:value,avg_edge_width_perc:value}}});}};
}
const flush = async () => {await Promise.resolve();await Promise.resolve();};
async function ready(h,id){h.select(id);h.read(h.readers.length-1);await h.load(h.images.length-1);}
(async()=>{
  let h=setup();await ready(h,'A');h.finish(0,4);await ready(h,'B');h.finish(1,1);assert.equal(h.nodes['#score #value'].innerHTML,'Score: 1.00');assert.equal(h.drawn.id,'B');
  console.log('PASS sequential selections');
  h=setup();await ready(h,'A');await ready(h,'B');h.finish(1,0.5);h.finish(0,3);assert.equal(h.nodes['#score #value'].innerHTML,'Score: 0.50');assert.equal(h.drawn.id,'B');assert.equal((h.nodes['#details'].innerHTML.match(/num_edges/g)||[]).length,1);
  assert.ok(h.workers.every(w=>w.terminated));
  console.log('PASS late worker result cannot overwrite newer score/details and workers cleaned up');
  h=setup();h.select('A');await ready(h,'B');h.finish(0,0.5);h.read(0);await h.load(1);assert.equal(h.drawn.id,'B');assert.equal(h.workers.length,1);
  console.log('PASS late FileReader completion cannot replace newer canvas');
  h=setup();h.select('A');h.read(0);await ready(h,'B');h.finish(0,0.5);await h.load(0);assert.equal(h.drawn.id,'B');assert.equal(h.workers.length,1);
  console.log('PASS late image decode cannot replace newer canvas');
  h=setup();await ready(h,'A');await ready(h,'B');h.finish(1,0.5);h.workers[0].onerror(new Error('obsolete'));assert.equal(h.nodes['#score #value'].innerHTML,'Score: 0.50');assert.equal(h.errors.length,0);
  console.log('PASS stale worker error preserves latest successful result');
  h=setup();h.select('A');await ready(h,'B');h.finish(0,0.5);h.readers[0].onerror(new Error('obsolete'));await flush();assert.equal(h.nodes['#score #value'].innerHTML,'Score: 0.50');assert.equal(h.errors.length,0);
  console.log('PASS stale read error preserves latest successful result');
  h=setup();h.select('A');h.read(0);await ready(h,'B');h.finish(0,0.5);h.images[0].onerror(new Error('obsolete'));await flush();assert.equal(h.nodes['#score #value'].innerHTML,'Score: 0.50');assert.equal(h.errors.length,0);
  console.log('PASS stale decode error preserves latest successful result');
  for(const kind of ['reader','image','worker']) {
    h=setup();await ready(h,'A');h.finish(0,2);h.select('B');
    if(kind==='reader')h.readers[1].onerror(new Error('read'));
    if(kind==='image'){h.read(1);h.images[1].onerror(new Error('decode'));}
    if(kind==='worker'){h.read(1);await h.load(1);h.workers[1].onerror(new Error('worker'));assert.ok(h.workers[1].terminated);}
    await flush();assert.equal(h.nodes['.spinner'].style.display,'none');assert.equal(h.nodes['#score #value'].innerHTML,'');assert.equal(h.errors.length,1);
  }
  console.log('PASS current read/decode/worker errors stop spinner without stale score');
})().catch(e=>{console.error(e);process.exitCode=1;});
