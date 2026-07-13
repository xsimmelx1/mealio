const fs=require('fs');const {parse}=require('csv-parse/sync');
const rows=parse(fs.readFileSync('C:/Users/sschlenker/Documents/Claude/herbi/scripts/.rewe.csv','utf8'),{columns:true,skip_empty_lines:true});
const nameRe=new RegExp(process.argv[2],'i');
const catRe=process.argv[3]?new RegExp(process.argv[3],'i'):null;
const excl=process.argv[4]?new RegExp(process.argv[4],'i'):null;
let n=0;
for(const r of rows){
  if(!nameRe.test(r.name))continue;
  if(catRe&&!catRe.test(r.category))continue;
  if(excl&&excl.test(r.name))continue;
  if(r.sale==='true')continue;
  console.log(`${r.name} | ${r.brand} | ${r.price} | ${r.grammage} | ${r.category}`);
  if(++n>=60)break;
}
console.log('--- shown:',n);
