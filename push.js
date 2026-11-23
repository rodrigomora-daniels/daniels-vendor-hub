/* My Workspace — push notifications (client). Needs dh-session.js (DH.rpc). */
(function(){
  var PUB='BJo59eIlInF3TaEEKI6xojB_6M6dCyr0IMrd8Ekk2qVNmxseSvqzecaCDEQyj_XHE55anOn3ngqQ3LHrrjisdT4';
  function supported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
  function ios(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  function standalone(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;}
  function key(s){var p='='.repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o;}
  function reg(){return navigator.serviceWorker.register('sw.js').then(function(){return navigator.serviceWorker.ready;});}
  try{window.addEventListener('load',function(){if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});});}catch(e){}
  async function current(){if(!supported())return null;try{var r=await reg();return await r.pushManager.getSubscription();}catch(e){return null;}}
  async function state(){
    var out={supported:supported(),needsInstall:ios()&&!standalone(),permission:supported()?Notification.permission:'denied',on:false,prefs:null};
    if(!out.supported)return out;
    var s=await current();
    try{var r=await DH.rpc('push_estado',{p_endpoint:s?s.endpoint:'-'});out.prefs=r.prefs;out.on=!!(s&&r.suscrito);}catch(e){}
    return out;
  }
  async function enable(){
    if(!supported())return {error:'unsupported'};
    if(ios()&&!standalone())return {error:'install'};
    var p=await Notification.requestPermission(); if(p!=='granted')return {error:'denied'};
    try{
      var r=await reg(), s=await r.pushManager.getSubscription();
      if(!s)s=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(PUB)});
      var j=s.toJSON();
      var x=await DH.rpc('push_suscribir',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_ua:navigator.userAgent});
      return x&&x.ok?{ok:true}:{error:'server'};
    }catch(e){return {error:'fail'};}
  }
  async function disable(){
    var s=await current(); if(!s)return {ok:true};
    try{await DH.rpc('push_baja',{p_endpoint:s.endpoint});}catch(e){}
    try{await s.unsubscribe();}catch(e){}
    return {ok:true};
  }
  async function savePrefs(p){return DH.rpc('push_prefs_guardar',{p_menciones:!!p.menciones,p_alertas:!!p.alertas,p_noticias:!!p.noticias,p_horario:!!p.horario,p_chats:p.chats!==false});}
  window.DHPush={supported:supported,state:state,enable:enable,disable:disable,savePrefs:savePrefs};
})();
