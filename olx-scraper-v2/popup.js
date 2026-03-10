
const CITIES=[
{n:'Hyderabad',s:'hyderabad_g4058526'},{n:'Mumbai',s:'mumbai_g4058997'},
{n:'Delhi',s:'delhi_g4058526'},{n:'Bangalore',s:'bangalore_g4058545'},
{n:'Chennai',s:'chennai_g4058546'},{n:'Pune',s:'pune_g4059011'},
{n:'Kolkata',s:'kolkata_g4058690'},{n:'Ahmedabad',s:'ahmedabad_g4058534'},
{n:'Jaipur',s:'jaipur_g4058668'},{n:'Lucknow',s:'lucknow_g4058709'},
{n:'Chandigarh',s:'chandigarh_g4058557'},{n:'Indore',s:'indore_g4058662'},
{n:'Kochi',s:'kochi_g4058694'},{n:'Coimbatore',s:'coimbatore_g4058564'},
{n:'Gurgaon',s:'gurgaon_g4058656'},{n:'Noida',s:'noida_g4058988'},
{n:'Ghaziabad',s:'ghaziabad_g4058636'},{n:'Faridabad',s:'faridabad_g4058617'},
{n:'Mysore',s:'mysore_g4058808'},{n:'Vizag',s:'visakhapatnam_g4059103'},
{n:'Nagpur',s:'nagpur_g4058810'},{n:'Bhopal',s:'bhopal_g4058552'},
{n:'Thiruvananthapuram',s:'thiruvananthapuram_g4059085'},
{n:'Surat',s:'surat_g4059062'},{n:'Vadodara',s:'vadodara_g4059095'},
{n:'Ludhiana',s:'ludhiana_g4058707'},{n:'Agra',s:'agra_g4058535'},
{n:'Varanasi',s:'varanasi_g4059097'},{n:'Patna',s:'patna_g4058991'},
{n:'Ranchi',s:'ranchi_g4059020'},{n:'Bhubaneswar',s:'bhubaneswar_g4058553'},
{n:'Guwahati',s:'guwahati_g4058657'},{n:'Dehradun',s:'dehradun_g4058581'},
{n:'Amritsar',s:'amritsar_g4058537'},{n:'Kanpur',s:'kanpur_g4058681'},
{n:'Nashik',s:'nashik_g4058812'},{n:'Thane',s:'thane_g4059083'},
{n:'Navi Mumbai',s:'navi-mumbai_g4058811'}];

let selCity=null,selSubLoc=null,subLocs=[],scrapedCars=[],isRunning=false;
const $=id=>document.getElementById(id);

function msg(data){return new Promise(r=>chrome.runtime.sendMessage(data,r));}

function renderCities(f){
  const g=$('cg');g.innerHTML='';
  (f?CITIES.filter(c=>c.n.toLowerCase().includes(f)):CITIES).forEach(c=>{
    const b=document.createElement('button');
    b.className='cbtn'+(selCity&&selCity.s===c.s?' act':'');
    b.textContent=c.n;
    b.onclick=()=>{selCity=c;selSubLoc=null;renderCities($('sc').value);loadSubLocations();$('st').textContent='Selected: '+c.n;};
    g.appendChild(b);
  });
}

function renderSubLocs(f){
  const g=$('slGrid');g.innerHTML='';
  (f?subLocs.filter(l=>l.n.toLowerCase().includes(f)):subLocs).forEach(l=>{
    const b=document.createElement('button');
    b.className='cbtn'+(selSubLoc&&selSubLoc.s===l.s?' act':'');
    b.textContent=l.n+' ('+l.c+')';
    b.onclick=()=>{selSubLoc=l;renderSubLocs($('slSearch').value);$('st').textContent=l.n+' in '+(selCity?selCity.n:'');};
    g.appendChild(b);
  });
}

async function loadSubLocations(){
  if(!selCity)return;subLocs=[];renderSubLocs();
  $('st').textContent='Loading sub-locations...';
  const res=await msg({action:'getSubLocations',citySlug:selCity.s});
  if(res&&res.ok){subLocs=res.data;renderSubLocs();$('st').textContent=subLocs.length+' sub-locations in '+selCity.n;}
  else $('st').textContent='Error loading sub-locations';
}

$('sc').addEventListener('input',()=>renderCities($('sc').value.toLowerCase()));
$('uc').addEventListener('click',()=>{
  const s=$('cc').value.trim();
  if(s){selCity={n:s.split('_')[0].replace(/-/g,' '),s};renderCities();loadSubLocations();}
});
$('locAll').addEventListener('click',()=>{selSubLoc=null;$('locAll').classList.add('act');$('locSub').classList.remove('act');$('subLocWrap').style.display='none';});
$('locSub').addEventListener('click',()=>{$('locSub').classList.add('act');$('locAll').classList.remove('act');$('subLocWrap').style.display='block';});
$('slSearch').addEventListener('input',()=>renderSubLocs($('slSearch').value.toLowerCase()));
renderCities();

// SCRAPING
$('go').addEventListener('click',async()=>{
  if(!selCity){$('st').textContent='\u26A0\uFE0F Select a city';return;}
  const locSlug=selSubLoc?selSubLoc.s:selCity.s;
  const locName=selSubLoc?selSubLoc.n:selCity.n;
  isRunning=true;scrapedCars=[];
  $('go').classList.add('hide');$('stop').classList.add('show');$('prog').classList.add('show');$('dlsec').classList.remove('show');

  try{
    $('pt').textContent='Getting brands for '+locName+'...';
    const brandRes=await msg({action:'getBrands',locSlug});
    if(!brandRes||!brandRes.ok||!brandRes.data.brands.length){
      $('st').textContent='No brands found';isRunning=false;$('go').classList.remove('hide');$('stop').classList.remove('show');return;
    }
    const brands=brandRes.data.brands,total=brandRes.data.total;
    $('pt').textContent=brands.length+' brands | ~'+total+' cars';

    const seenIds=new Set();
    for(let i=0;i<brands.length&&isRunning;i++){
      const brand=brands[i];
      if(brand.count===0)continue;
      $('pt').textContent='Brand '+(i+1)+'/'+brands.length+': '+brand.name+' ('+brand.count+')';
      $('pf').style.width=Math.round((i/brands.length)*100)+'%';

      let page=1,consecDupes=0;
      while(isRunning){
        const pageRes=await msg({action:'scrapePage',locSlug,brandId:brand.id,page});
        if(!pageRes||!pageRes.ok||!pageRes.data||!pageRes.data.length)break;

        let nc=0;
        pageRes.data.forEach(it=>{if(!seenIds.has(it.id)){seenIds.add(it.id);scrapedCars.push(it);nc++;}});
        $('bs2').textContent=brand.name+' p'+page+' +'+nc+' | Total: '+scrapedCars.length;
        if(nc===0){consecDupes++;if(consecDupes>=2)break;}else consecDupes=0;
        page++;
        await new Promise(r=>setTimeout(r,400));
      }
    }
    $('pf').style.width='100%';
    finishScraping(locName);
  }catch(e){$('st').textContent='\u274C '+e.message;isRunning=false;$('go').classList.remove('hide');$('stop').classList.remove('show');}
});
$('stop').addEventListener('click',()=>{isRunning=false;});

function finishScraping(locName){
  isRunning=false;$('go').classList.remove('hide');$('stop').classList.remove('show');
  const cleaned=scrapedCars.map(car=>{
    const p={};if(car.parameters)car.parameters.forEach(x=>{p[x.key]=x.formatted_value||x.value_name||x.value||'';});
    const imgs=(car.images||[]).filter(x=>x.url&&!x.url.includes('.svg')).map(x=>x.url);
    const loc=car.locations_resolved||{};
    const desc=car.description||'';const ai={};
    const im=desc.match(/ADDITIONAL VEHICLE INFORMATION:([\s\S]*?)$/);
    if(im)im[1].trim().split('\n').forEach(l=>{const pts=l.split(':');if(pts.length>=2){const k=pts[0].trim().replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_').toLowerCase();const v=pts.slice(1).join(':').trim();if(k&&v)ai[k]=v;}});
    const cd=desc.split('ADDITIONAL VEHICLE INFORMATION:')[0].trim();
    const f={id:car.id||'',title:car.title||'',price:car.price?car.price.value.raw:'',price_display:car.price?car.price.value.display:'',
      brand:p.make||'',model:p.model||'',variant:p.variant||'',year:p.year||'',
      fuel:p.petrol||p.diesel||p.cng||p.lpg||p.electric||'',transmission:p.transmission||'',
      km_driven:p.mileage||'',no_of_owners:p.first_owner||'',body_type:car.car_body_type||'',
      description:cd,state:loc.ADMIN_LEVEL_1_name||'',city:loc.ADMIN_LEVEL_3_name||'',
      locality:loc.SUBLOCALITY_LEVEL_1_name||'',user_type:car.user_type||'',
      elite_seller:car.elite_seller||false,certified_car:car.certified_car||false,
      created_at:car.created_at||'',display_date:car.display_date||'',
      favorites:car.favorites?car.favorites.count:0,
      car_url:'https://www.olx.in/item/iid-'+(car.id||''),
      images:imgs.join(' | '),images_count:imgs.length};
    Object.keys(ai).forEach(k=>{f['info_'+k]=ai[k];});return f;
  });
  scrapedCars=cleaned;
  $('pt').textContent='Done! '+cleaned.length+' unique cars';
  $('st').textContent='\u2705 '+cleaned.length+' cars from '+locName;
  $('dlsec').classList.add('show');
}

$('dj').addEventListener('click',()=>{
  const j=JSON.stringify(scrapedCars,null,2);const b=new Blob([j],{type:'application/json'});
  const u=URL.createObjectURL(b);const cn=(selSubLoc?selSubLoc.n:selCity.n).toLowerCase().replace(/\s+/g,'-');
  chrome.downloads.download({url:u,filename:'olx_'+cn+'_all_cars.json',saveAs:true});
});
$('dc').addEventListener('click',()=>{
  const hSet=new Set();scrapedCars.forEach(c=>Object.keys(c).forEach(k=>hSet.add(k)));const h=[...hSet];
  const esc=v=>{if(v==null)return'';const s=String(v);return(s.includes(',')||s.includes('"')||s.includes('\n'))?'"'+s.replace(/"/g,'""')+'"':s;};
  const rows=[h.map(x=>esc(x)).join(',')];
  scrapedCars.forEach(c=>rows.push(h.map(x=>esc(c[x]!=null?c[x]:'')).join(',')));
  const csv=rows.join('\n');const b=new Blob([csv],{type:'text/csv'});
  const u=URL.createObjectURL(b);const cn=(selSubLoc?selSubLoc.n:selCity.n).toLowerCase().replace(/\s+/g,'-');
  chrome.downloads.download({url:u,filename:'olx_'+cn+'_all_cars.csv',saveAs:true});
});
