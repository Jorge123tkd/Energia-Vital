'use strict';
(function(root){
 const items=Object.freeze([['team','♙','Colaboración y permisos','projects'],['catalog','▥','Catálogo comercial','library'],['backup','↧','Copias de secciones compartidas','backups'],['inventory','▦','Almacén y compras'],['finance','＄','Finanzas y compromisos'],['publication','↗','Publicaciones comerciales']]);
 function install(send,{web=false}={}){
  const menu=document.getElementById('nav');if(!menu||menu.dataset.evBusinessInstalled)return;
  menu.dataset.evBusinessInstalled='true';
  const entries=web?[...items,['exit','←','Volver a Bonaire']]:items;
  function notify(e){if(typeof toast==='function')toast(String(e.message||e));else alert(String(e.message||e))}
  function dispatch(section){Promise.resolve().then(()=>send(section)).catch(notify)}
  function decorate(){
   if(!menu.querySelector('.brand')||menu.querySelector('#ev-business-nav'))return;
   const group=document.createElement('div');group.id='ev-business-nav';
   const label=document.createElement('div');label.className='navlabel';label.textContent='OPERACIONES BONAIRE';group.append(label);
   for(const [section,glyph,name,under] of entries){
    const button=document.createElement('button');button.type='button';button.className='navitem';button.dataset.studioSection=section;
    const icon=document.createElement('span');icon.textContent=glyph;button.append(icon,document.createTextNode(name));
    button.addEventListener('click',()=>{menu.classList.remove('visible');dispatch(section)});
    const anchor=under&&Array.from(menu.querySelectorAll('button.navitem')).find(b=>b.getAttribute('onclick')==="nav('"+under+"')");
    if(anchor){button.style.paddingLeft='27px';button.style.fontSize='12px';anchor.after(button)}
    else group.append(button);
   }
   menu.append(group);
  }
  menu.addEventListener('click',e=>{const button=e.target.closest?.('button.navitem');if(button&&!button.dataset.studioSection)dispatch('engineering')},true);
  new MutationObserver(decorate).observe(menu,{childList:true});decorate();
 }
 Object.defineProperty(root,'EVBusinessMenu',{value:Object.freeze({items,install}),writable:false,configurable:false});
})(globalThis);
