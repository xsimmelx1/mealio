const fs=require('fs');
const {parse}=require('csv-parse/sync');
const text=fs.readFileSync('C:/Users/sschlenker/Documents/Claude/herbi/scripts/.rewe.csv','utf8');
const rows=parse(text,{columns:true,skip_empty_lines:true});
const term=process.argv[2];
const re=new RegExp(term,'i');
const excl=process.argv[3]?new RegExp(process.argv[3],'i'):null;
let n=0;
for(const r of rows){
  if(!re.test(r.name))continue;
  if(excl&&excl.test(r.name))continue;
  if(r.sale==='true')continue;
  console.log(`${r.name} | ${r.brand} | ${r.price} | ${r.grammage} | ${r.category}`);
  if(++n>=50)break;
}
console.log('--- shown:',n);
