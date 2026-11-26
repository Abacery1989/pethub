(function(){
const C=window.STORE_CONFIG, CUR=C.CURRENCY;
const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('ar-EG',{maximumFractionDigits:2})+' '+CUR;
async function api(path,opt={}){
  const r=await fetch(C.SUPABASE_URL+'/rest/v1/'+path,{method:opt.method||'GET',headers:{apikey:C.SUPABASE_KEY,Authorization:'Bearer '+C.SUPABASE_KEY,'Content-Type':'application/json'},body:opt.body?JSON.stringify(opt.body):undefined});
  const t=await r.text(); let j; try{j=t?JSON.parse(t):null}catch(e){j=null}
  if(!r.ok) throw new Error((j&&j.message)||'حصل خطأ، حاول مرة تانية');
  return j;
}
const cart={get(){try{return JSON.parse(localStorage.getItem('cart')||'[]')}catch(e){return[]}},set(c){localStorage.setItem('cart',JSON.stringify(c));badge()},
  add(id,q=1){const c=this.get();const i=c.find(x=>x.id===id);if(i)i.qty+=q;else c.push({id,qty:q});this.set(c)},
  setQty(id,q){let c=this.get();c.forEach(x=>{if(x.id===id)x.qty=q});c=c.filter(x=>x.qty>0);this.set(c)},
  remove(id){this.set(this.get().filter(x=>x.id!==id))},clear(){this.set([])}};
function badge(){$('#cartcount').textContent=cart.get().reduce((a,b)=>a+b.qty,0)}
let S={},CATS=[],PRODS=[];
const COLORS=['#0f766e','#b45309','#6d28d9','#be123c','#1d4ed8','#4d7c0f'];
function imgHtml(p){
  if(p.image_url) return `<div class="img"><img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy"></div>`;
  const i=(p.name||'?').charCodeAt(0)%COLORS.length;
  return `<div class="img" style="background:${COLORS[i]}">${esc((p.name||'?').trim().charAt(0))}</div>`;
}
function card(p){
  const out=p.stock<=0;
  return `<a class="card" href="#/product/${p.id}">${imgHtml(p)}<div class="body"><span class="name">${esc(p.name)}</span>
  <span class="price">${money(p.price)}${p.compare_at_price?`<span class="old">${money(p.compare_at_price)}</span>`:''}</span>
  ${out?'<span class="tag out">غير متوفر</span>':''}${p.is_sample?'<span class="tag sample">منتج تجريبي</span>':''}</div></a>`;
}
async function load(){
  const [s,c,p]=await Promise.all([api('settings?select=*'),api('categories?select=*&order=sort'),api('products?select=*&active=eq.true&order=created_at.desc')]);
  S={};s.forEach(x=>S[x.key]=x.value);CATS=c;PRODS=p;
  document.title=S.store_name||'المتجر';$('#logo').textContent=S.store_name||'المتجر';$('#flogo').textContent=S.store_name||'المتجر';
  $('#faddr').textContent=S.address||'';
  if(S.whatsapp){const w=$('#wa');w.href='https://wa.me/'+S.whatsapp.replace(/\D/g,'');w.hidden=false}
}
const sampleNotice=()=>PRODS.some(p=>p.is_sample)?'<div class="notice">هذا متجر تجريبي: المنتجات والأسعار المعلّمة "منتج تجريبي" أمثلة فقط.</div>':'';
const pages={
 home(){
  app.innerHTML=`<div class="hero"><h1>${esc(S.store_name)}</h1><p><b>${esc(S.tagline||'')}</b><br>أكل وألعاب ومستلزمات القطط والكلاب. ادفع عند الاستلام أو بتحويل بنكي.</p><a class="btn" href="#/products">تصفح المنتجات</a></div>${sampleNotice()}
  <h2>التصنيفات</h2><div class="filters">${CATS.map(c=>`<a class="btn sec" href="#/products?cat=${c.id}">${esc(c.name)}</a>`).join('')}</div>
  <h2>وصل حديثاً</h2><div class="grid">${PRODS.slice(0,8).map(card).join('')||'<p>لا توجد منتجات بعد.</p>'}</div>`;
 },
 products(q){
  const cat=q.get('cat')||'',s=q.get('q')||'',sort=q.get('sort')||'new',av=q.get('av')||'';
  let l=PRODS.filter(p=>(!cat||p.category_id===cat)&&(!s||(p.name+' '+(p.description||'')).toLowerCase().includes(s.toLowerCase()))&&(!av||p.stock>0));
  if(sort==='low')l.sort((a,b)=>a.price-b.price);else if(sort==='high')l.sort((a,b)=>b.price-a.price);
  app.innerHTML=`<h1>المنتجات</h1>${sampleNotice()}<div class="filters">
   <input id="fq" placeholder="ابحث عن منتج" value="${esc(s)}">
   <select id="fc"><option value="">كل التصنيفات</option>${CATS.map(c=>`<option value="${c.id}" ${c.id===cat?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
   <select id="fs"><option value="new">الأحدث</option><option value="low" ${sort==='low'?'selected':''}>السعر: الأقل</option><option value="high" ${sort==='high'?'selected':''}>السعر: الأعلى</option></select>
   <label style="margin:0;display:flex;align-items:center;gap:6px"><input type="checkbox" id="fa" ${av?'checked':''}> المتوفر فقط</label></div>
   <p>${l.length} منتج</p><div class="grid">${l.map(card).join('')||'<p>لا توجد نتائج.</p>'}</div>`;
  const go=()=>{const p=new URLSearchParams();if($('#fq').value)p.set('q',$('#fq').value);if($('#fc').value)p.set('cat',$('#fc').value);if($('#fs').value!=='new')p.set('sort',$('#fs').value);if($('#fa').checked)p.set('av','1');location.hash='#/products?'+p};
  $('#fq').addEventListener('keydown',e=>{if(e.key==='Enter')go()});['#fc','#fs','#fa'].forEach(x=>$(x).addEventListener('change',go));
  $('#fq').addEventListener('change',go);
 },
 product(id){
  const p=PRODS.find(x=>x.id===id);if(!p){app.innerHTML='<h1>المنتج غير موجود</h1><a href="#/products">رجوع للمنتجات</a>';return}
  const c=CATS.find(x=>x.id===p.category_id);
  app.innerHTML=`<div class="detail"><div>${imgHtml(p)}</div><div><h1>${esc(p.name)}</h1>${c?`<span class="tag">${esc(c.name)}</span>`:''}
   <p class="price" style="font-size:22px">${money(p.price)}${p.compare_at_price?`<span class="old">${money(p.compare_at_price)}</span>`:''}</p>
   <p>${esc(p.description).replace(/\n/g,'<br>')}</p>
   <p>${p.stock>0?(p.stock<=5?`<span class="tag out">باقي ${p.stock} فقط</span>`:'<span class="tag">متوفر</span>'):'<span class="tag out">غير متوفر</span>'}${p.is_sample?' <span class="tag sample">منتج تجريبي</span>':''}</p>
   ${p.stock>0?`<div class="qty"><button id="m">-</button><b id="qv">1</b><button id="pl">+</button></div> <button class="btn" id="add">أضف للسلة</button>`:'<button class="btn" disabled>غير متوفر</button>'}
   <p id="msg" class="ok"></p></div></div>`;
  if(p.stock>0){let q=1;$('#m').onclick=()=>{q=Math.max(1,q-1);$('#qv').textContent=q};$('#pl').onclick=()=>{q=Math.min(p.stock,q+1);$('#qv').textContent=q};
   $('#add').onclick=()=>{const cur=(cart.get().find(x=>x.id===id)||{qty:0}).qty;if(cur+q>p.stock){$('#msg').className='err';$('#msg').textContent='الكمية المتاحة '+p.stock+' فقط';return}cart.add(id,q);$('#msg').className='ok';$('#msg').innerHTML='تمت الإضافة. <a href="#/cart">اذهب للسلة</a>'}}
 },
 cart(){
  const items=cart.get().map(i=>({...i,p:PRODS.find(x=>x.id===i.id)})).filter(i=>i.p);
  if(!items.length){app.innerHTML='<h1>السلة</h1><p>السلة فاضية.</p><a class="btn" href="#/products">تصفح المنتجات</a>';return}
  const sub=items.reduce((a,i)=>a+i.p.price*i.qty,0);
  app.innerHTML=`<h1>السلة</h1><div class="tablewrap"><table><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th><th></th></tr>
  ${items.map(i=>`<tr><td><a href="#/product/${i.id}">${esc(i.p.name)}</a></td><td>${money(i.p.price)}</td><td><span class="qty"><button data-d="-1" data-id="${i.id}">-</button><b>${i.qty}</b><button data-d="1" data-id="${i.id}">+</button></span></td><td>${money(i.p.price*i.qty)}</td><td><button class="btn sec sm" data-rm="${i.id}">حذف</button></td></tr>`).join('')}</table></div>
  <div class="sum" style="margin-top:16px"><div class="t"><span>المجموع الفرعي</span><span>${money(sub)}</span></div></div><p id="msg" class="err"></p>
  <p><a class="btn" href="#/checkout">إتمام الطلب</a> <a class="btn sec" href="#/products">كمّل تسوق</a></p>`;
  app.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const it=items.find(x=>x.id===b.dataset.id);const n=it.qty+Number(b.dataset.d);if(n>it.p.stock){$('#msg').textContent='الكمية المتاحة '+it.p.stock+' فقط';return}cart.setQty(it.id,n);pages.cart()});
  app.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{cart.remove(b.dataset.rm);pages.cart()});
 },
 async checkout(){
  const items=cart.get().map(i=>({...i,p:PRODS.find(x=>x.id===i.id)})).filter(i=>i.p);
  if(!items.length){location.hash='#/cart';return}
  const dms=await api('delivery_methods?select=*&active=eq.true&order=sort');
  const sub=items.reduce((a,i)=>a+i.p.price*i.qty,0);let disc=0,code='';
  app.innerHTML=`<h1>إتمام الطلب</h1><div class="detail"><form class="form" id="f">
   <label>الاسم بالكامل *</label><input name="name" required>
   <div class="two"><div><label>رقم الموبايل *</label><input name="phone" type="tel" required></div><div><label>البريد الإلكتروني</label><input name="email" type="email"></div></div>
   <label>المحافظة / المدينة *</label><input name="city" required>
   <label>العنوان بالتفصيل *</label><textarea name="address" required></textarea>
   <label>طريقة التوصيل *</label><select name="dm">${dms.map(d=>`<option value="${d.id}" data-fee="${d.fee}">${esc(d.name)} (${money(d.fee)})</option>`).join('')}</select>
   <label>طريقة الدفع *</label><select name="pay"><option value="cod">الدفع عند الاستلام</option><option value="bank_transfer">تحويل بنكي</option></select>
   <div id="bank" class="notice" hidden>${esc(S.bank_info||'')}<br>بعد التحويل ابعت صورة الإيصال على واتساب مع رقم الطلب.</div>
   <label>ملاحظات</label><textarea name="notes"></textarea>
   <label>كود الخصم</label><div style="display:flex;gap:8px"><input name="code" style="flex:1"><button type="button" class="btn sec" id="ap">تطبيق</button></div><div id="dm2"></div>
   <p id="err" class="err"></p><button class="btn" id="sb" type="submit">تأكيد الطلب</button></form>
   <div><div class="sum" id="sum"></div></div></div>`;
  const f=$('#f');
  const fee=()=>Number(f.dm.selectedOptions[0].dataset.fee||0);
  const draw=()=>{$('#sum').innerHTML=items.map(i=>`<div><span>${esc(i.p.name)} × ${i.qty}</span><span>${money(i.p.price*i.qty)}</span></div>`).join('')+`<div><span>المجموع الفرعي</span><span>${money(sub)}</span></div>${disc>0?`<div><span>خصم</span><span>-${money(disc)}</span></div>`:''}<div><span>التوصيل</span><span>${money(fee())}</span></div><div class="t"><span>الإجمالي</span><span>${money(sub-disc+fee())}</span></div>`;$('#bank').hidden=f.pay.value!=='bank_transfer'};
  draw();f.dm.onchange=draw;f.pay.onchange=draw;
  $('#ap').onclick=async()=>{const c=f.code.value.trim();code='';disc=0;if(!c){draw();return}
   try{const r=await api('rpc/check_discount',{method:'POST',body:{p_code:c,p_subtotal:sub}});if(r<0){$('#dm2').innerHTML='<p class="err">الكود غير صالح أو الحد الأدنى غير مكتمل</p>'}else{disc=r;code=c;$('#dm2').innerHTML='<p class="ok">تم تطبيق الخصم</p>'}}catch(e){$('#dm2').innerHTML='<p class="err">'+esc(e.message)+'</p>'}draw()};
  f.onsubmit=async e=>{e.preventDefault();$('#err').textContent='';$('#sb').disabled=true;
   try{const r=await api('rpc/place_order',{method:'POST',body:{p_name:f.name.value,p_phone:f.phone.value,p_email:f.email.value,p_address:f.address.value,p_city:f.city.value,p_notes:f.notes.value,p_delivery_id:f.dm.value,p_payment:f.pay.value,p_code:code||f.code.value.trim()||null,p_items:items.map(i=>({id:i.id,qty:i.qty}))}});
    sessionStorage.setItem('lastOrder',JSON.stringify({...r,name:f.name.value,phone:f.phone.value}));cart.clear();await load();location.hash='#/confirm'}
   catch(er){$('#err').textContent=er.message;$('#sb').disabled=false}};
 },
 confirm(){
  let o;try{o=JSON.parse(sessionStorage.getItem('lastOrder'))}catch(e){}
  if(!o){app.innerHTML='<h1>لا يوجد طلب</h1><a href="#/">الرئيسية</a>';return}
  app.innerHTML=`<h1>تم استلام طلبك</h1><div class="sum"><div><span>رقم الطلب</span><b>${esc(o.order_no)}</b></div><div><span>الإجمالي</span><b>${money(o.total)}</b></div><div><span>الدفع</span><span>${o.payment==='cod'?'عند الاستلام':'تحويل بنكي'}</span></div></div>
  <p>احتفظ برقم الطلب. تقدر تتابع حالته من <a href="#/track">تتبع الطلب</a> برقم الطلب ورقم الموبايل.</p>
  ${o.payment==='bank_transfer'?`<div class="notice">${esc(S.bank_info||'')}<br>ابعت إيصال التحويل على واتساب مع رقم الطلب.</div>`:''}
  <p>سنتواصل معك على ${esc(o.phone)} لتأكيد الطلب.</p>`;
 },
 track(){
  app.innerHTML=`<h1>تتبع الطلب</h1><form class="form" id="f"><label>رقم الطلب (مثال ORD-1001)</label><input name="n" required><label>رقم الموبايل</label><input name="p" type="tel" required><p></p><button class="btn">بحث</button></form><div id="res"></div>`;
  const L={new:'جديد',confirmed:'تم التأكيد',shipped:'تم الشحن',delivered:'تم التسليم',cancelled:'ملغي'};
  $('#f').onsubmit=async e=>{e.preventDefault();try{const r=await api('rpc/track_order',{method:'POST',body:{p_order_no:e.target.n.value,p_phone:e.target.p.value}});
   $('#res').innerHTML=r?`<div class="sum" style="margin-top:14px"><div><span>الطلب</span><b>${esc(r.order_no)}</b></div><div><span>الحالة</span><b>${L[r.status]||esc(r.status)}</b></div><div><span>الإجمالي</span><span>${money(r.total)}</span></div></div>`:'<p class="err">لم نجد طلب بهذه البيانات</p>'}catch(er){$('#res').innerHTML='<p class="err">'+esc(er.message)+'</p>'}};
 },
 contact(){app.innerHTML=`<h1>تواصل معنا</h1><div class="notice">بيانات الاتصال أدناه تجريبية ويغيّرها صاحب المتجر من لوحة التحكم.</div>
  <p>واتساب: <a href="https://wa.me/${esc((S.whatsapp||'').replace(/\D/g,''))}" target="_blank" rel="noopener"><bdi>${esc(S.whatsapp)}</bdi></a></p><p>البريد: <bdi>${esc(S.contact_email)}</bdi></p><p>العنوان: ${esc(S.address)}</p>`},
 about(){app.innerHTML=`<h1>من نحن</h1><div class="notice">نص تجريبي: اكتب هنا قصة المتجر.</div><p>نحن ${esc(S.store_name)}. نوفر منتجات بجودة جيدة وتوصيل لكل المحافظات والدفع عند الاستلام.</p>`},
 faq(){const q=[['كيف أطلب؟','أضف المنتجات للسلة ثم اضغط إتمام الطلب واملأ بياناتك.'],['ما طرق الدفع؟','الدفع عند الاستلام أو تحويل بنكي. لا يوجد دفع بالكارت أونلاين حالياً.'],['كيف أتابع طلبي؟','من صفحة تتبع الطلب برقم الطلب ورقم الموبايل.'],['هل أقدر ألغي الطلب؟','تواصل معنا على واتساب قبل الشحن.']];
  app.innerHTML=`<h1>الأسئلة الشائعة</h1><div class="notice">أسئلة تجريبية، عدّلها حسب سياسة المتجر.</div>`+q.map(x=>`<details><summary>${x[0]}</summary><p>${x[1]}</p></details>`).join('')},
 privacy(){app.innerHTML=`<h1>سياسة الخصوصية</h1><div class="notice">نموذج عام يحتاج مراجعة صاحب المتجر قبل الإطلاق الفعلي.</div><p>نجمع الاسم والموبايل والعنوان والبريد (اختياري) لتنفيذ الطلب والتواصل معك فقط. لا نبيع بياناتك. نحتفظ بالبيانات طالما لزم لتنفيذ الطلبات والمتطلبات القانونية. للحذف أو التعديل تواصل معنا.</p>`},
 terms(){app.innerHTML=`<h1>الشروط والأحكام</h1><div class="notice">نموذج عام يحتاج مراجعة صاحب المتجر قبل الإطلاق الفعلي.</div><p>باستخدامك الموقع توافق على الشروط. الأسعار والتوافر قابلة للتغيير. يتم تأكيد الطلب بعد التواصل معك. يحق للمتجر إلغاء الطلب عند عدم توفر المنتج.</p>`},
 shipping(){app.innerHTML=`<h1>الشحن والاسترجاع</h1><div class="notice">نموذج عام يحتاج مراجعة صاحب المتجر قبل الإطلاق الفعلي.</div><p><b>الشحن:</b> رسوم التوصيل تظهر في صفحة الطلب حسب المنطقة.</p><p><b>الاسترجاع:</b> مدة وشروط الاسترجاع يحددها صاحب المتجر. (اكتب المدة هنا).</p>`}
};
async function route(){
  const h=location.hash.replace(/^#\/?/,'');const [path,qs]=h.split('?');const q=new URLSearchParams(qs||'');const seg=path.split('/');
  window.scrollTo(0,0);
  try{
    if(!seg[0])return pages.home();
    if(seg[0]==='product')return pages.product(seg[1]);
    if(pages[seg[0]])return await pages[seg[0]](q);
    app.innerHTML='<h1>الصفحة غير موجودة</h1><a href="#/">الرئيسية</a>';
  }catch(e){app.innerHTML='<p class="err">'+esc(e.message)+'</p>'}
}
window.addEventListener('hashchange',route);
badge();
load().then(route).catch(e=>{app.innerHTML='<p class="err">تعذر تحميل المتجر: '+esc(e.message)+'</p>'});
})();
