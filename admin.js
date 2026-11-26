(function(){
const C=window.STORE_CONFIG;const sb=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY);
const $=s=>document.querySelector(s),app=$('#app');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' '+C.CURRENCY;
const ST={new:'جديد',confirmed:'تم التأكيد',shipped:'تم الشحن',delivered:'تم التسليم',cancelled:'ملغي'};
let tab='orders',cats=[];
async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session) return login();
  const {data:ok,error}=await sb.rpc('is_admin');
  if(error||!ok){app.innerHTML=`<h1>غير مصرح</h1><p>هذا الحساب (${esc(session.user.email)}) ليس مدير المتجر.</p><button class="btn" id="lo">خروج</button>`;$('#lo').onclick=out;return}
  $('#out').hidden=false;$('#out').onclick=out;shell();
}
async function out(){await sb.auth.signOut();location.reload()}
function login(){
  app.innerHTML=`<h1>دخول مدير المتجر</h1><form class="form" id="f"><label>البريد الإلكتروني</label><input name="e" type="email" required><p></p><button class="btn">ابعتلي رابط الدخول</button></form><p id="m"></p><p style="color:#625b5d;font-size:14px">سيصلك رابط دخول على البريد. يعمل فقط للبريد المسجل كمدير.</p>`;
  $('#f').onsubmit=async e=>{e.preventDefault();const {error}=await sb.auth.signInWithOtp({email:e.target.e.value.trim(),options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
    $('#m').className=error?'err':'ok';$('#m').textContent=error?error.message:'تم الإرسال. افتح الرابط من بريدك على نفس الجهاز.'};
}
function shell(){
  app.innerHTML=`<div class="tabs">${[['orders','الطلبات'],['products','المنتجات'],['categories','التصنيفات'],['discounts','الخصومات'],['delivery','التوصيل'],['settings','إعدادات المتجر']].map(t=>`<button class="btn sec sm ${t[0]===tab?'on':''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="pane"></div>`;
  app.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;shell()});
  ({orders,products,categories,discounts,delivery,settings})[tab]();
}
const pane=()=>$('#pane');
const fail=e=>{alert(e.message||e)};
async function orders(){
  const {data,error}=await sb.from('orders').select('*, order_items(*)').order('created_at',{ascending:false}).limit(200);
  if(error)return pane().innerHTML='<p class="err">'+esc(error.message)+'</p>';
  pane().innerHTML=`<h2>الطلبات (${data.length})</h2>`+(data.length?`<div class="tablewrap"><table><tr><th>رقم</th><th>العميل</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th></th></tr>${data.map(o=>`<tr><td>${esc(o.order_no)}<br><small>${new Date(o.created_at).toLocaleString('ar-EG')}</small></td><td>${esc(o.customer_name)}<br><bdi>${esc(o.phone)}</bdi></td><td>${money(o.total)}</td><td>${o.payment_method==='cod'?'عند الاستلام':'تحويل بنكي'}</td>
   <td><select data-o="${o.id}">${Object.keys(ST).map(k=>`<option value="${k}" ${k===o.status?'selected':''}>${ST[k]}</option>`).join('')}</select></td><td><button class="btn sec sm" data-v="${o.id}">تفاصيل</button></td></tr><tr id="d${o.id}" hidden><td colspan="6">${esc(o.city)} - ${esc(o.address)}<br>توصيل: ${esc(o.delivery_method)} (${money(o.delivery_fee)})${o.email?'<br>'+esc(o.email):''}${o.notes?'<br>ملاحظات: '+esc(o.notes):''}${o.discount_code?`<br>خصم ${esc(o.discount_code)}: -${money(o.discount_amount)}`:''}<br>${o.order_items.map(i=>esc(i.name)+' × '+i.qty+' = '+money(i.price*i.qty)).join('<br>')}</td></tr>`).join('')}</table></div>`:'<p>لا توجد طلبات بعد.</p>');
  pane().querySelectorAll('[data-o]').forEach(s=>s.onchange=async()=>{const prev=data.find(o=>o.id===s.dataset.o);const {error}=await sb.from('orders').update({status:s.value}).eq('id',s.dataset.o);
    if(error){fail(error);s.value=prev.status;return}
    if(s.value==='cancelled'&&prev.status!=='cancelled'&&confirm('إرجاع الكميات للمخزون؟')){for(const i of prev.order_items){if(i.product_id){const {data:p}=await sb.from('products').select('stock').eq('id',i.product_id).single();if(p)await sb.from('products').update({stock:p.stock+i.qty}).eq('id',i.product_id)}}}
    prev.status=s.value});
  pane().querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{const r=$('#d'+b.dataset.v);r.hidden=!r.hidden});
}
async function products(edit){
  const [{data:c},{data:p,error}]=await Promise.all([sb.from('categories').select('*').order('sort'),sb.from('products').select('*').order('created_at',{ascending:false})]);
  cats=c||[];if(error)return pane().innerHTML='<p class="err">'+esc(error.message)+'</p>';
  pane().innerHTML=`<h2>المنتجات (${p.length})</h2><button class="btn" id="new">+ منتج جديد</button><div id="form"></div>
  <div class="tablewrap"><table><tr><th></th><th>الاسم</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th></th></tr>${p.map(x=>`<tr><td>${x.image_url?`<img class="thumb" src="${esc(x.image_url)}">`:'<div class="thumb"></div>'}</td><td>${esc(x.name)}${x.is_sample?' <span class="tag sample">تجريبي</span>':''}</td><td>${money(x.price)}</td><td>${x.stock<=0?'<span class="tag out">نفد (0)</span>':x.stock}</td><td>${x.active?'ظاهر':'مخفي'}</td><td><button class="btn sec sm" data-e="${x.id}">تعديل</button> <button class="btn red sm" data-x="${x.id}">حذف</button></td></tr>`).join('')}</table></div>`;
  const form=(x)=>{x=x||{name:'',description:'',price:'',compare_at_price:'',stock:0,active:true,category_id:'',image_url:''};
   $('#form').innerHTML=`<form class="form" id="pf" style="margin:16px 0;padding:14px;border:1px solid #e9e4e2;border-radius:12px"><b>${x.id?'تعديل منتج':'منتج جديد'}</b>
   <label>الاسم *</label><input name="name" required value="${esc(x.name)}"><label>الوصف</label><textarea name="description">${esc(x.description)}</textarea>
   <div class="row2"><div><label>السعر *</label><input name="price" type="number" step="0.01" min="0" required value="${esc(x.price)}"></div><div><label>السعر قبل الخصم</label><input name="cmp" type="number" step="0.01" min="0" value="${esc(x.compare_at_price||'')}"></div></div>
   <div class="row2"><div><label>المخزون (0 = غير متوفر)</label><input name="stock" type="number" min="0" required value="${esc(x.stock)}"></div><div><label>التصنيف</label><select name="cat"><option value="">بدون</option>${cats.map(k=>`<option value="${k.id}" ${k.id===x.category_id?'selected':''}>${esc(k.name)}</option>`).join('')}</select></div></div>
   <label>الصورة</label>${x.image_url?`<img class="thumb" src="${esc(x.image_url)}"> `:''}<input name="img" type="file" accept="image/*">
   <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" style="width:auto" ${x.active?'checked':''}> ظاهر في المتجر</label>
   <p><button class="btn">حفظ</button> <button type="button" class="btn sec" id="cx">إلغاء</button></p></form>`;
   $('#cx').onclick=()=>$('#form').innerHTML='';
   $('#pf').onsubmit=async e=>{e.preventDefault();const f=e.target;let url=x.image_url||null;
    try{const file=f.img.files[0];if(file){if(file.size>3*1024*1024)throw new Error('الصورة أكبر من 3MB');const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');const path=Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
      const {error}=await sb.storage.from('product-images').upload(path,file,{contentType:file.type});if(error)throw error;url=sb.storage.from('product-images').getPublicUrl(path).data.publicUrl}
     const row={name:f.name.value.trim(),description:f.description.value,price:Number(f.price.value),compare_at_price:f.cmp.value?Number(f.cmp.value):null,stock:parseInt(f.stock.value,10),category_id:f.cat.value||null,image_url:url,active:f.active.checked};
     const r=x.id?await sb.from('products').update(row).eq('id',x.id):await sb.from('products').insert(row);if(r.error)throw r.error;products()}catch(er){fail(er)}};
  };
  $('#new').onclick=()=>form();
  pane().querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{form(p.find(z=>z.id===b.dataset.e));window.scrollTo(0,0)});
  pane().querySelectorAll('[data-x]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف المنتج نهائياً؟ (الطلبات القديمة تبقى)'))return;const {error}=await sb.from('products').delete().eq('id',b.dataset.x);if(error)fail(error);else products()});
}
async function simple(table,title,cols,defaults,order){
  const {data,error}=await sb.from(table).select('*').order(order||'id');if(error)return pane().innerHTML='<p class="err">'+esc(error.message)+'</p>';
  pane().innerHTML=`<h2>${title}</h2><div class="tablewrap"><table><tr>${cols.map(c=>`<th>${c.l}</th>`).join('')}<th></th></tr>${data.map(r=>`<tr data-id="${r.id}">${cols.map(c=>`<td>${cell(c,r[c.k])}</td>`).join('')}<td><button class="btn sm" data-s>حفظ</button> <button class="btn red sm" data-d>حذف</button></td></tr>`).join('')}
  <tr id="nr">${cols.map(c=>`<td>${cell(c,defaults[c.k])}</td>`).join('')}<td><button class="btn sm" data-a>+ إضافة</button></td></tr></table></div>`;
  const read=tr=>{const o={};cols.forEach((c,i)=>{const el=tr.children[i].querySelector('input,select');o[c.k]=c.t==='bool'?el.checked:c.t==='num'?Number(el.value):(el.value===''?null:el.value)});return o};
  pane().querySelectorAll('[data-s]').forEach(b=>b.onclick=async()=>{const tr=b.closest('tr');const {error}=await sb.from(table).update(read(tr)).eq('id',tr.dataset.id);error?fail(error):alert('تم الحفظ')});
  pane().querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm('حذف؟'))return;const tr=b.closest('tr');const {error}=await sb.from(table).delete().eq('id',tr.dataset.id);error?fail(error):simple(table,title,cols,defaults,order)});
  pane().querySelector('[data-a]').onclick=async()=>{const o=read($('#nr'));const {error}=await sb.from(table).insert(o);error?fail(error):simple(table,title,cols,defaults,order)};
}
function cell(c,v){if(c.t==='bool')return `<input type="checkbox" style="width:auto" ${v?'checked':''}>`;if(c.t==='sel')return `<select>${c.o.map(o=>`<option value="${o[0]}" ${o[0]===v?'selected':''}>${o[1]}</option>`).join('')}</select>`;
  return `<input type="${c.t==='num'?'number':c.t==='date'?'date':'text'}" ${c.t==='num'?'step="0.01"':''} value="${esc(c.t==='date'&&v?String(v).slice(0,10):v)}" style="min-width:90px">`}
function categories(){simple('categories','التصنيفات',[{k:'name',l:'الاسم'},{k:'slug',l:'المعرّف (إنجليزي بدون مسافات)'},{k:'sort',l:'الترتيب',t:'num'}],{name:'',slug:'',sort:0},'sort')}
function discounts(){simple('discounts','الخصومات والعروض',[{k:'code',l:'الكود'},{k:'kind',l:'النوع',t:'sel',o:[['percent','نسبة %'],['fixed','مبلغ ثابت']]},{k:'value',l:'القيمة',t:'num'},{k:'min_subtotal',l:'حد أدنى للطلب',t:'num'},{k:'active',l:'فعّال',t:'bool'},{k:'note',l:'ملاحظة'}],{code:'',kind:'percent',value:10,min_subtotal:0,active:true,note:''},'code')}
function delivery(){simple('delivery_methods','طرق التوصيل',[{k:'name',l:'الاسم'},{k:'fee',l:'الرسوم',t:'num'},{k:'active',l:'فعّال',t:'bool'},{k:'sort',l:'الترتيب',t:'num'}],{name:'',fee:0,active:true,sort:0},'sort')}
async function settings(){
  const {data}=await sb.from('settings').select('*');const L={store_name:'اسم المتجر',whatsapp:'رقم واتساب (بصيغة دولية بدون +)',bank_info:'بيانات التحويل البنكي',contact_email:'بريد التواصل',address:'عنوان المتجر'};
  pane().innerHTML=`<h2>إعدادات المتجر</h2><form class="form" id="sf">${Object.keys(L).map(k=>`<label>${L[k]}</label><input name="${k}" value="${esc((data.find(x=>x.key===k)||{}).value)}">`).join('')}<p></p><button class="btn">حفظ</button></form>`;
  $('#sf').onsubmit=async e=>{e.preventDefault();const rows=Object.keys(L).map(k=>({key:k,value:e.target[k].value}));const {error}=await sb.from('settings').upsert(rows);error?fail(error):alert('تم الحفظ')};
}
sb.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_IN'&&!$('#pane'))init()});
init();
})();
