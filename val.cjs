const f=process.argv[2];
const d=require(f);
let tot=0,txt=0,chibi=0,sil=0,long=0,W=0,ids=new Set(),silPages=0,bad=0,types=new Set();
const rows=[];
for(const p of d.pages){
  let w=0,pt=0,ps=0;
  if(p.panels.length<4||p.panels.length>6)console.log('PANEL COUNT p'+p.page,p.panels.length);
  for(const pn of p.panels){
    tot++; if(pn.chibi)chibi++; if(pn.silhouette)sil++;
    const dl=pn.dialogue||[];
    if(dl.length){pt++;txt++;} else ps++;
    for(const c of pn.chars)ids.add(c.name);
    for(const l of dl){ids.add(l.char);types.add(l.type);const n=l.text.split(/\s+/).length;w+=n;if(n>16){long++;console.log('LONG',n,l.text);}}
  }
  if(ps>1){console.log('  !! p'+p.page+' silent panels '+ps);bad++;}
  if(pt===0)silPages++;
  W+=w; rows.push({page:p.page,words:w});
}
const under=rows.filter(r=>r.words<70),over=rows.filter(r=>r.words>130);
console.log('== '+f+' ==');
console.log('pages',d.pages.length,'panels',tot,'chibi',chibi,'silhouette',sil,'over16w',long);
console.log('WORDS',W,'| AVG/PAGE',(W/d.pages.length).toFixed(1),'| range',Math.min(...rows.map(r=>r.words)),'-',Math.max(...rows.map(r=>r.words)));
console.log('text panels',txt+'/'+tot,'=',Math.round(txt/tot*100)+'%','| silent pages',silPages,'| pages>1 silent',bad);
console.log('UNDER70:',under.map(r=>'p'+r.page+'('+r.words+')').join(' ')||'none');
console.log('OVER130:',over.map(r=>'p'+r.page+'('+r.words+')').join(' ')||'none');
console.log('types:',[...types].join(' '));
console.log('ids:',[...ids].sort().join(' '));
