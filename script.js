const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const $=id=>document.getElementById(id);
let rows=[],active=null,uid=0;
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/*  Lectura de PDF  */
async function pdfLines(buf){
  const pdf=await pdfjsLib.getDocument({data:buf}).promise, out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const tc=await (await pdf.getPage(p)).getTextContent();
    const its=tc.items.filter(i=>i.str.trim()).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],w:i.width}));
    its.sort((a,b)=>b.y-a.y||a.x-b.x);
    let cur=[],cy=null;
    const flush=()=>{
      cur.sort((a,b)=>a.x-b.x);
      let t='',end=null;
      cur.forEach(i=>{ if(end!==null){const g=i.x-end; t+=g>1.5?' ':'';} t+=i.s; end=i.x+i.w; });
      if(t.trim())out.push(t.replace(/\s+/g,' ').trim());
      cur=[];
    };
    its.forEach(i=>{ if(cy!==null&&Math.abs(i.y-cy)>4)flush(); cy=i.y; cur.push(i); });
    flush();
  }
  return out;
}
const num=s=>parseFloat(String(s).replace(/,/g,''))||0;
const MABR={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,set:9,oct:10,nov:11,dic:12};
function parseDate(s){
  const p=n=>String(n).padStart(2,'0');let m,y,mo,d;
  if(m=s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/)){y=m[1];mo=+m[2];d=+m[3];}
  else if(m=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)){y=m[3];mo=+m[2];d=+m[1];}
  else if(m=s.match(/(\d{1,2})\s*(?:de\s+|[-\/. ])\s*([a-záéíóú]{3,10})\.?\s*(?:de\s+|[-\/. ])\s*(\d{4})/i)){y=m[3];mo=MABR[m[2].toLowerCase().slice(0,3)];d=+m[1];}
  else return '';
  return(mo>=1&&mo<=12&&d>=1&&d<=31)?`${y}-${p(mo)}-${p(d)}`:'';
}
function findDate(flat){
  for(const re of [/emisi[oó]n/gi,/fecha/gi]){
    let m;while(m=re.exec(flat)){const d=parseDate(flat.slice(m.index,m.index+90));if(d)return d;}
  }
  return parseDate(flat);
}
function parseInvoice(L){
  const flat=L.join(' ');
  const r={nombre:'',nit:'',desc:'',factura:'',serie:'',fecha:'',motivo:'',monto:0,raw:L.join('\n')};
  let m;
  if(m=flat.match(/NIT\s*(?:del\s*)?Receptor\s*:?\s*([0-9]{3,}(?:-?[0-9Kk])?)/i))r.nit=m[1].replace(/-/g,'').toUpperCase();
  if(m=flat.match(/Nombre\s*(?:del\s*)?Receptor\s*:?\s*(.{2,80}?)(?=\s+(?:NIT|Direcci[oó]n|Correo|Tel[eé]fono|Serie|N[uú]mero|Fecha|Nombre|Emisor|Receptor|Tipo)\b|$)/i))r.nombre=m[1].trim();
  if(m=flat.match(/\bSerie\s*:?\s*([A-Z0-9]{6,12})\b/i))r.serie=m[1].toUpperCase();
  else if(m=flat.match(/Autorizaci[oó]n\s*:?\s*([0-9A-F]{8})-/i))r.serie=m[1].toUpperCase();
  if(m=flat.match(/N[uú]mero\s*(?:de\s*)?DTE\s*:?\s*(\d+)/i)||flat.match(/N[uú]mero\s*:?\s*(\d{6,})/i))r.factura=m[1];
  r.fecha=findDate(flat);

  //  Ítems 
  const stop=/^(total(?:es)?\b|sub ?total|gran total|iva\b|impuesto|datos del certificador|certificador|monto en letras|observaciones|forma de pago|sujeto)/i;
  const bad=/total|iva\b|impuesto|\bnit\b|serie|fecha|autoriz|tel[eé]fono|direcc|descuento|moneda|certific|cantidad/i;
  const rowRe=/^(.*?)((?:\s+-?\d[\d,]*\.\d+){2,})$/;
  const cutTax=x=>x.replace(/\s*\b(?:IVA|PETR[OÓ]LEO|TIMBRE|TURISMO|BEBIDAS|TABACO|CEMENTO|DISTRIBUCI[OÓ]N|INGUAT|BOMBEROS)\b(?=[^\d]*\d[\d,]*\.\d{5,6}).*$/i,'').trim();
  const hdr=/^\(?q\)?$|^descuentos?\b|^total\s*\(q\)|^impuestos?$/i;
  const cleanD=x=>{x=x.trim().replace(/^(?:\d{1,3}\s+)?(?:(?:Bien|Servicio|B|S)\s+)?(?:\d+(?:\.\d+)?\s+)?(?=\D)/i,'').trim();return /^\d+(\.\d+)?$/.test(x)?'':x;};
  function scan(start,fallback){
    const items=[];let pend=[],own=false,sum=0;
    for(let i=start;i<L.length;i++){
      const l=cutTax(L[i]);
      if(!l||hdr.test(l))continue;
      if(!fallback&&stop.test(l))break;
      if(fallback&&bad.test(l))continue;
      const mm=l.match(rowRe);
      if(mm){
        const d=cleanD(mm[1]);
        if(fallback&&!/[A-Za-zÁÉÍÓÚáéíóú]{3}/.test(d))continue;
        const ns=mm[2].trim().split(/\s+/);sum+=num(ns[ns.length-1]);
        const full=[...pend,d].filter(Boolean).join(' ').trim();pend=[];own=!!d;
        if(full)items.push(full);
      }else if(!fallback){
        if(own&&items.length&&!/^\d+$/.test(l))items[items.length-1]+=' '+l;else pend.push(l);
      }
    }
    return{items,sum};
  }
  const hi=L.findIndex(l=>/descripci[oó]n|concepto|producto|bien o servicio/i.test(l)&&!/\bnit\b|serie/i.test(l));
  let res=hi>=0?scan(hi+1,false):{items:[],sum:0};
  if(!res.items.length)res=scan(0,true);
  r.desc=res.items.join('; ').replace(/\s+/g,' ').trim();

  //  Monto total 
  let tot=null,t;
  for(const l of L){
    if(!/^(gran\s+)?total(?:es)?\b/i.test(l)||/sub|impuesto|letras|retenci/i.test(l))continue;
    const ns=[...cutTax(l).matchAll(/(?<![\d.,])-?\d[\d,]*\.\d{2,6}(?![\d.])/g)].map(x=>num(x[0]));
    if(ns.length)tot=ns[ns.length-1];
  }
  const re=/(?:gran\s*)?total([^0-9]{0,60}?)([\d,]+\.\d{2,6})(?![\d.])/gi;
  while(tot===null&&(t=re.exec(flat))){
    const pre=flat.slice(Math.max(0,t.index-12),t.index);
    if(!/sub|impuesto|iva\b|descuento|letras|retenci/i.test(pre+t[0]))tot=num(t[2]);
  }
  if(tot===null){
    const all=[...flat.matchAll(/(?<![\d.,])\d[\d,]*\.\d{2,6}(?![\d.])/g)].map(x=>num(x[0]));
    if(all.length)tot=Math.max(...all);
  }
  r.monto=Math.round((tot||res.sum||0)*100)/100;
  return r;
}

/*  Carga de archivos */
const parentOf=(parts,fallback)=>parts.length>1?parts[parts.length-2]:fallback;
async function readZip(buf,prefix,zipName,out){
  const z=await JSZip.loadAsync(buf);
  for(const e of Object.values(z.files)){
    const parts=e.name.split('/').filter(Boolean),base=parts[parts.length-1]||'';
    if(e.dir||e.name.includes('__MACOSX')||base.startsWith('.'))continue;
    if(/\.pdf$/i.test(base))out.push({name:prefix+' › '+e.name,buf:await e.async('arraybuffer'),grupo:parentOf(parts,zipName)});
    else if(/\.zip$/i.test(base))await readZip(await e.async('arraybuffer'),prefix+' › '+e.name,base.replace(/\.zip$/i,''),out);
  }
}
async function expand(items){
  const out=[];
  for(const {file,path} of items){
    const parts=path.split('/').filter(Boolean);
    try{
      if(/\.zip$/i.test(file.name))await readZip(await file.arrayBuffer(),path,file.name.replace(/\.zip$/i,''),out);
      else if(/\.pdf$/i.test(file.name))out.push({name:path,buf:await file.arrayBuffer(),grupo:parentOf(parts,'Sin carpeta')});
    }catch(e){const li=document.createElement('li');li.className='bad';li.textContent='✗ '+path+' — ZIP no válido ('+e.message+')';$('log').prepend(li);}
  }
  return out;
}
async function dropItems(dt){
  const ents=[...(dt.items||[])].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
  if(!ents.length)return [...dt.files].map(f=>({file:f,path:f.name}));
  const out=[];
  async function walk(en){
    if(en.isFile){const f=await new Promise((ok,no)=>en.file(ok,no));out.push({file:f,path:en.fullPath.replace(/^\//,'')});}
    else if(en.isDirectory){
      const rd=en.createReader();let batch;
      do{batch=await new Promise((ok,no)=>rd.readEntries(ok,no));for(const c of batch)await walk(c);}while(batch.length);
    }
  }
  for(const en of ents)await walk(en);
  return out;
}
async function handleFiles(files){
  const log=$('log');
  for(const f of await expand(files)){
    const li=document.createElement('li');li.textContent='Procesando '+f.name+'…';log.prepend(li);
    try{
      const r=parseInvoice(await pdfLines(f.buf));
      r.id=++uid;r.src=f.name;r.grupo=f.grupo;rows.push(r);
      const falta=['nombre','nit','desc','factura','serie','fecha'].filter(k=>!r[k]);
      if(!r.monto)falta.push('monto');
      li.className=falta.length?'bad':'ok';
      li.textContent=(falta.length?'⚠ ':'✓ ')+f.name+(falta.length?' — revisar: '+falta.join(', '):' — leída correctamente');
      active=r.grupo;
    }catch(e){li.className='bad';li.textContent='✗ '+f.name+' — no se pudo leer ('+e.message+')';}
    render();
  }
}

/*  Agrupar y mostrar  */
const keyOf=r=>r.grupo||'Sin carpeta';
const norm=t=>t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const mesIdx=k=>MESES.findIndex(m=>norm(k).includes(m));
function groups(){
  const g={};rows.forEach(r=>(g[keyOf(r)]??=[]).push(r));
  return Object.keys(g).sort((a,b)=>{
    if(a==='Sin carpeta')return 1;if(b==='Sin carpeta')return -1;
    const ia=mesIdx(a),ib=mesIdx(b);
    if(ia>=0&&ib>=0&&ia!==ib)return ia-ib;
    if(ia>=0&&ib<0)return -1;if(ia<0&&ib>=0)return 1;
    return a.localeCompare(b,'es',{numeric:true});
  }).map(k=>({k,rows:g[k].sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||'')||a.id-b.id)}));
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const money=n=>'Q'+n.toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
const sinFac=r=>/^(sin factura|recibo)/i.test(r.factura);

function render(){
  const gs=groups();
  if(!gs.find(g=>g.k===active))active=gs[0]?.k||null;
  $('tabs').innerHTML=gs.map(g=>`<button class="tab ${g.k===active?'on':''}" data-k="${esc(g.k)}">${esc(g.k)}<small>(${g.rows.length})</small></button>`).join('');
  const g=gs.find(x=>x.k===active);
  $('empty').style.display=g?'none':'block';
  ['exp1','expZip','expAll'].forEach(i=>$(i).disabled=!rows.length);
  const inp=(r,k,type='text',extra='')=>`<td><input data-id="${r.id}" data-k="${k}" type="${type}" ${extra} value="${esc(r[k])}" class="${r[k]===''||r[k]===0?'miss':''}"></td>`;
  $('body').innerHTML=g?g.rows.map(r=>`<tr class="${sinFac(r)?'nofac':''}">${inp(r,'nombre')}${inp(r,'nit')}${inp(r,'desc')}${inp(r,'factura')}${inp(r,'serie')}${inp(r,'fecha','date')}<td><input data-id="${r.id}" data-k="motivo" value="${esc(r.motivo)}" placeholder="Escribe el motivo"></td>${inp(r,'monto','number','step="0.01"')}<td style="font-size:11px;color:var(--mut);max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.src||'fila manual')}">${esc(r.src||'fila manual')}</td><td class="x"><button data-raw="${r.id}" title="Ver texto leído del PDF">🔍</button> <button data-del="${r.id}" title="Eliminar">✕</button></td></tr>`).join(''):'';
  totals();
}
function totals(){
  const g=groups().find(x=>x.k===active);
  $('tot').textContent=money(g?g.rows.reduce((s,r)=>s+(+r.monto||0),0):0);
}

$('body').addEventListener('change',e=>{
  const t=e.target,r=rows.find(x=>x.id==t.dataset.id);if(!r)return;
  r[t.dataset.k]=t.dataset.k==='monto'?(parseFloat(t.value)||0):t.value.trim();
  render();
});
$('body').addEventListener('click',e=>{
  const id=e.target.dataset.del;if(id){rows=rows.filter(r=>r.id!=id);render();}
  const rid=e.target.dataset.raw;if(rid){const r=rows.find(x=>x.id==rid);$('dlgT').textContent='Texto leído de: '+(r.src||'fila manual');$('dpre').textContent=r.raw||'(fila manual, sin PDF)';$('dlg').showModal();}
});
$('tabs').addEventListener('click',e=>{const k=e.target.closest('.tab')?.dataset.k;if(k){active=k;render();}});
$('add').onclick=()=>{
  const b=rows[0]||{};
  rows.push({id:++uid,nombre:b.nombre||'',nit:b.nit||'',desc:'',factura:'Sin factura',serie:'N/A',fecha:new Date().toISOString().slice(0,10),grupo:active||'Sin carpeta',motivo:'',monto:0});
  active=keyOf(rows[rows.length-1]);render();
};
$('clear').onclick=()=>{if(rows.length&&confirm('¿Eliminar todas las facturas cargadas?')){rows=[];$('log').innerHTML='';render();}};

/* ---------- Carga: arrastrar / seleccionar ---------- */
const drop=$('drop');
drop.onclick=()=>$('file').click();
drop.onkeydown=e=>{if(e.key==='Enter')$('file').click();};
const toItems=fs=>[...fs].map(f=>({file:f,path:f.webkitRelativePath||f.name}));
$('file').onchange=e=>{handleFiles(toItems(e.target.files));e.target.value='';};
$('pickDir').onclick=()=>$('dir').click();
$('dir').onchange=e=>{handleFiles(toItems(e.target.files));e.target.value='';};
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
drop.addEventListener('drop',async e=>handleFiles(await dropItems(e.dataTransfer)));

$('dclose').onclick=()=>$('dlg').close();
$('dcopy').onclick=()=>navigator.clipboard.writeText($('dpre').textContent);
/*Exportar a Excel*/
const H=['Nombre','Nit','Descripción','Número de factura','Número de serie','Fecha','Motivo','Monto total (Q)'];
const safe=t=>t.replace(/[\\\/:*?"<>|]/g,'_').trim()||'sin_nombre';
function buildWb(gs){
  const n=$('num').value||1,wb=XLSX.utils.book_new(),used=new Set();
  gs.forEach(g=>{
    const label=`Caja chica ${g.k} ${n}`;
    const aoa=[['FACTURA DE LA FINCA'],[label],H];
    g.rows.forEach(r=>{
      let fe='';
      if(r.fecha){const [y,m,d]=r.fecha.split('-').map(Number);fe={t:'n',v:Date.UTC(y,m-1,d)/864e5+25569,z:'dd/mm/yyyy'};}
      aoa.push([r.nombre,String(r.nit),r.desc,r.factura,r.serie,fe,r.motivo,{t:'n',v:+r.monto||0,z:'#,##0.00'}]);
    });
    const tot=g.rows.reduce((s,r)=>s+(+r.monto||0),0),last=aoa.length;
    aoa.push(['','','','','','','TOTAL',{t:'n',f:`SUM(H4:H${last})`,v:tot,z:'#,##0.00'}]);
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:34},{wch:12},{wch:44},{wch:18},{wch:16},{wch:12},{wch:42},{wch:16}];
    let name=label.replace(/[\\\/?*\[\]:]/g,'').slice(0,31),i=2;
    while(used.has(name))name=name.slice(0,28)+' '+i++;
    used.add(name);XLSX.utils.book_append_sheet(wb,ws,name);
  });
  return wb;
}
$('exp1').onclick=()=>{
  const g=groups().find(x=>x.k===active);if(!g)return;
  XLSX.writeFile(buildWb([g]),`Caja_chica_${safe(g.k)}.xlsx`);
};
$('expAll').onclick=()=>{XLSX.writeFile(buildWb(groups()),'Caja_chica_todo.xlsx');};
$('expZip').onclick=async()=>{
  const zip=new JSZip();
  groups().forEach(g=>zip.file(`Caja_chica_${safe(g.k)}.xlsx`,XLSX.write(buildWb([g]),{bookType:'xlsx',type:'array'})));
  const url=URL.createObjectURL(await zip.generateAsync({type:'blob'}));
  const a=document.createElement('a');a.href=url;a.download='Caja_chica_un_excel_por_carpeta.zip';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
};
render();
