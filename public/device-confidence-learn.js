(function(){
  "use strict";

  var LEARN_KEY = "sr_trusted_device_identity_learned_v1";
  var ID_KEY = "sr_tool_user_id";
  var NAME_KEY = "sr_tool_user_name";
  var DEVICE_SECRET_KEY = "sr_tool_device_instance_secret_v1";
  var LEARN_EVERY_MS = 1000 * 60 * 60 * 24 * 30;

  function localGet(k){ try { return localStorage.getItem(k) || ""; } catch { return ""; } }
  function localSet(k, v){ try { localStorage.setItem(k, v); } catch {} }
  function createDeviceSecret(){
    try{
      var a=crypto.randomUUID?crypto.randomUUID():Math.random().toString(16).slice(2);
      var bytes=new Uint8Array(24); crypto.getRandomValues(bytes);
      return "dev_"+a+"_"+Array.from(bytes).map(function(x){return x.toString(16).padStart(2,"0");}).join("");
    }catch{
      return "dev_"+Date.now().toString(16)+"_"+Math.random().toString(16).slice(2)+Math.random().toString(16).slice(2);
    }
  }
  function getStableDeviceSecret(){
    var v=localGet(DEVICE_SECRET_KEY);
    if(!/^dev_[a-zA-Z0-9_.:-]{20,}$/.test(v)){
      v=createDeviceSecret();
      localSet(DEVICE_SECRET_KEY,v);
    }
    return v;
  }
  function cookieGet(name){
    try{
      var prefix = name + "=";
      var parts = String(document.cookie || "").split(/;\s*/);
      for(var i=0;i<parts.length;i++) if(parts[i].indexOf(prefix) === 0) return decodeURIComponent(parts[i].slice(prefix.length));
    }catch{}
    return "";
  }
  function cleanName(v){ return String(v || "").replace(/\u0000/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40); }
  function shouldSkipPage(){ var p = String(location.pathname || ""); return p === "/login" || p === "/logout" || p.indexOf("/api/") === 0; }
  function fallbackHash(s){ s=String(s||""); var h=2166136261; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,"0"); }
  function hashText(input){
    var s = String(input || "");
    if(window.crypto && crypto.subtle && window.TextEncoder){
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function(buf){
        return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,"0"); }).join("");
      }).catch(function(){ return fallbackHash(s); });
    }
    return Promise.resolve(fallbackHash(s));
  }
  function bucketNumber(value, bucket){ var n=Number(value||0); if(!isFinite(n)||n<=0) return ""; var b=Number(bucket||1); return String(Math.round(n/b)*b); }
  function getCanvasHash(){
    try{
      var c=document.createElement("canvas"); c.width=320; c.height=110; var ctx=c.getContext("2d"); if(!ctx) return Promise.resolve("");
      ctx.textBaseline="top"; ctx.fillStyle="#f60"; ctx.fillRect(5,5,95,33); ctx.fillStyle="#069"; ctx.font="16px Arial"; ctx.fillText("SR Tool بصمة الجهاز 4.7",12,14);
      ctx.fillStyle="rgba(102,204,0,0.7)"; ctx.font="18px Times New Roman"; ctx.fillText("عقرب الصحراء",16,48);
      ctx.globalCompositeOperation="multiply"; ctx.fillStyle="rgb(255,0,255)"; ctx.beginPath(); ctx.arc(205,55,28,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="rgba(20,40,90,0.8)"; ctx.strokeRect(245,18,45,55);
      return hashText(c.toDataURL());
    }catch{ return Promise.resolve(""); }
  }
  function getAudioHash(){ return new Promise(function(resolve){ try{ var Ctx=window.OfflineAudioContext||window.webkitOfflineAudioContext; if(!Ctx) return resolve(""); var ctx=new Ctx(1,44100,44100); var osc=ctx.createOscillator(); var comp=ctx.createDynamicsCompressor(); var gain=ctx.createGain(); osc.type="triangle"; osc.frequency.value=10000; comp.threshold.value=-50; comp.knee.value=40; comp.ratio.value=12; comp.attack.value=0; comp.release.value=0.25; gain.gain.value=0.05; osc.connect(comp); comp.connect(gain); gain.connect(ctx.destination); osc.start(0); ctx.startRendering().then(function(buffer){ var data=buffer.getChannelData(0), sample=""; for(var i=4500;i<5000&&i<data.length;i+=7) sample += Math.abs(data[i]).toFixed(7)+","; return hashText(sample); }).then(resolve).catch(function(){ resolve(""); }); }catch{ resolve(""); } }); }
  function getFontsHash(){ try{ var c=document.createElement("canvas"), ctx=c.getContext("2d"); if(!ctx) return Promise.resolve(""); var fonts=["Arial","Tahoma","Times New Roman","Courier New","Verdana","Georgia","Segoe UI","Roboto","Open Sans","Calibri","Cambria","Noto Sans Arabic","Trebuchet MS","Impact","Lucida Console"]; var txt="SR Tool عقرب الصحراء 0123456789"; var widths=fonts.map(function(font){ ctx.font="16px "+font+", monospace"; return font+":"+(Math.round(ctx.measureText(txt).width*100)/100); }).join("|"); return hashText(widths); }catch{ return Promise.resolve(""); } }
  function getWebglInfo(){ try{ var c=document.createElement("canvas"); var gl=c.getContext("webgl")||c.getContext("experimental-webgl"); if(!gl) return Promise.resolve({}); var dbg=gl.getExtension("WEBGL_debug_renderer_info"); var vendor=dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR); var renderer=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER); var ext=(gl.getSupportedExtensions&&gl.getSupportedExtensions())||[]; var params=[gl.getParameter(gl.VERSION),gl.getParameter(gl.SHADING_LANGUAGE_VERSION),gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_VERTEX_ATTRIBS),gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)].join("|"); return Promise.all([hashText(ext.sort().join("|")),hashText(params)]).then(function(h){ return { vendor:String(vendor||""), renderer:String(renderer||""), version:String(gl.getParameter(gl.VERSION)||""), shadingLanguageVersion:String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)||""), maxTextureSize:String(gl.getParameter(gl.MAX_TEXTURE_SIZE)||""), maxRenderbufferSize:String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||""), maxVertexAttribs:String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)||""), maxCombinedTextureImageUnits:String(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)||""), extensionsHash:h[0], paramsHash:h[1] }; }); }catch{ return Promise.resolve({}); } }
  function getClientHints(){ try{ var ua=navigator.userAgentData; if(!ua) return Promise.resolve({}); var base={ brands:Array.isArray(ua.brands)?ua.brands.map(function(b){return b.brand+":"+b.version;}):[], mobile:!!ua.mobile, platform:ua.platform||"" }; if(typeof ua.getHighEntropyValues==="function") return ua.getHighEntropyValues(["architecture","bitness","model","platformVersion","uaFullVersion","fullVersionList","wow64"]).then(function(high){ return Object.assign(base,{ architecture:high.architecture||"", bitness:high.bitness||"", model:high.model||"", platformVersion:high.platformVersion||"", uaFullVersion:high.uaFullVersion||"", fullVersionList:Array.isArray(high.fullVersionList)?high.fullVersionList.map(function(b){return b.brand+":"+b.version;}):[], wow64:!!high.wow64 }); }).catch(function(){ return base; }); return Promise.resolve(base); }catch{ return Promise.resolve({}); } }
  function getMediaFeatures(){ var q=function(query,yes,no){ try{return matchMedia(query).matches?yes:no;}catch{return "";} }; return { pointer:q("(pointer: fine)","fine",q("(pointer: coarse)","coarse","none")), anyPointer:q("(any-pointer: fine)","fine",q("(any-pointer: coarse)","coarse","none")), hover:q("(hover: hover)","hover","none"), anyHover:q("(any-hover: hover)","hover","none"), colorGamut:q("(color-gamut: rec2020)","rec2020",q("(color-gamut: p3)","p3",q("(color-gamut: srgb)","srgb",""))), contrast:q("(prefers-contrast: more)","more",q("(prefers-contrast: less)","less","no-preference")), forcedColors:q("(forced-colors: active)","active","none"), monochrome:q("(monochrome)","yes","no"), update:q("(update: fast)","fast",q("(update: slow)","slow","none")), dynamicRange:q("(dynamic-range: high)","high","standard") }; }
  function getStorageInfo(){ try{ if(!navigator.storage||!navigator.storage.estimate) return Promise.resolve({}); return Promise.all([navigator.storage.estimate(), navigator.storage.persisted?navigator.storage.persisted():Promise.resolve(false)]).then(function(r){ var est=r[0]||{}; return { quotaBucket:bucketNumber(est.quota||0,1024*1024*128), usageBucket:bucketNumber(est.usage||0,1024*1024*16), persisted:!!r[1] }; }).catch(function(){return {};}); }catch{return Promise.resolve({});} }
  function getIntlInfo(){ try{ var ro=Intl.DateTimeFormat().resolvedOptions()||{}; return { locale:ro.locale||"", calendar:ro.calendar||"", numberingSystem:ro.numberingSystem||"", hourCycle:ro.hourCycle||"" }; }catch{return {};} }
  function getKeyboardInfo(){ try{ var kb=navigator.keyboard; if(!kb||typeof kb.getLayoutMap!=="function") return Promise.resolve({layoutAvailable:false,layoutHash:""}); return kb.getLayoutMap().then(function(map){ var keys=["KeyA","KeyQ","KeyZ","KeyM","Digit1","Digit2","Minus","Equal","BracketLeft","BracketRight","Semicolon","Quote","Backslash","Comma","Period","Slash","Backquote","IntlBackslash"]; return hashText(keys.map(function(k){return k+":"+(map.get(k)||"");}).join("|")).then(function(h){return {layoutAvailable:true,layoutHash:h};}); }).catch(function(){return {layoutAvailable:false,layoutHash:""};}); }catch{return Promise.resolve({layoutAvailable:false,layoutHash:""});} }
  function getNetworkInfo(){ try{ var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection||{}; return { effectiveType:c.effectiveType||"", type:c.type||"", downlinkBucket:bucketNumber(c.downlink||0,0.5), rttBucket:bucketNumber(c.rtt||0,50), saveData:!!c.saveData }; }catch{return {};} }
  function getBatteryInfo(){ try{ if(typeof navigator.getBattery!=="function") return Promise.resolve({supported:false}); return navigator.getBattery().then(function(b){ return { supported:true, charging:!!b.charging, levelBucket:bucketNumber((b.level||0)*100,10), chargingTimeBucket:isFinite(b.chargingTime)?bucketNumber(b.chargingTime,600):"", dischargingTimeBucket:isFinite(b.dischargingTime)?bucketNumber(b.dischargingTime,600):"" }; }).catch(function(){return {supported:false};}); }catch{return Promise.resolve({supported:false});} }
  function getMediaDevicesInfo(){ try{ if(!navigator.mediaDevices||typeof navigator.mediaDevices.enumerateDevices!=="function") return Promise.resolve({supported:false}); return navigator.mediaDevices.enumerateDevices().then(function(devices){ var kinds=devices.map(function(d){return d.kind+":"+(d.deviceId?"id":"noid")+":"+(d.groupId?"grp":"nogrp");}).sort().join("|"); return hashText(kinds).then(function(h){return { supported:true, audioInputs:devices.filter(function(d){return d.kind==="audioinput";}).length, audioOutputs:devices.filter(function(d){return d.kind==="audiooutput";}).length, videoInputs:devices.filter(function(d){return d.kind==="videoinput";}).length, kindsHash:h };}); }).catch(function(){return {supported:false};}); }catch{return Promise.resolve({supported:false});} }
  function getCapabilitiesInfo(){ try{ var flags={ serviceWorker:!!navigator.serviceWorker, webAssembly:typeof WebAssembly!=="undefined", indexedDB:!!window.indexedDB, localStorage:(function(){try{localStorage.setItem("sr_cap_test","1");localStorage.removeItem("sr_cap_test");return true;}catch{return false;}})(), sessionStorage:(function(){try{sessionStorage.setItem("sr_cap_test","1");sessionStorage.removeItem("sr_cap_test");return true;}catch{return false;}})(), notificationPermission:(typeof Notification!=="undefined"&&Notification.permission)?Notification.permission:"", pdfViewerEnabled:!!navigator.pdfViewerEnabled, installedPwa:(function(){try{return matchMedia("(display-mode: standalone)").matches;}catch{return false;}})(), standalone:!!navigator.standalone, bluetooth:!!navigator.bluetooth, usb:!!navigator.usb, hid:!!navigator.hid, serial:!!navigator.serial, clipboard:!!navigator.clipboard, credentials:!!navigator.credentials, locks:!!navigator.locks, share:!!navigator.share, wakeLock:!!navigator.wakeLock, fileSystemAccess:!!window.showOpenFilePicker, speechSynthesis:!!window.speechSynthesis, speechRecognition:!!(window.SpeechRecognition||window.webkitSpeechRecognition), gamepads:(function(){try{return (navigator.getGamepads&&Array.from(navigator.getGamepads()||[]).filter(Boolean).length)||0;}catch{return 0;}})() }; return hashText(Object.keys(flags).sort().map(function(k){return k+":"+flags[k];}).join("|")).then(function(apiFlagsHash){ return { serviceWorker:flags.serviceWorker, webAssembly:flags.webAssembly, indexedDB:flags.indexedDB, localStorage:flags.localStorage, sessionStorage:flags.sessionStorage, notificationPermission:flags.notificationPermission, pdfViewerEnabled:flags.pdfViewerEnabled, installedPwa:flags.installedPwa, standalone:flags.standalone, apiFlagsHash:apiFlagsHash }; }); }catch{return Promise.resolve({});} }
  function collectDeviceFingerprint(){
    var nav=navigator||{}, scr=screen||{}, vv=window.visualViewport||{};
    var tz=""; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||""; }catch{}
    var plugins=""; try{ plugins=Array.from(nav.plugins||[]).map(function(p){return p.name+":"+p.filename+":"+p.description;}).slice(0,50).join("|"); }catch{}
    var colorScheme=""; try{ colorScheme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"; }catch{}
    var reducedMotion=""; try{ reducedMotion=matchMedia("(prefers-reduced-motion: reduce)").matches?"reduce":"no-preference"; }catch{}
    return Promise.all([getCanvasHash(),getAudioHash(),getFontsHash(),getWebglInfo(),hashText(plugins),getClientHints(),getStorageInfo(),getKeyboardInfo(),getCapabilitiesInfo(),Promise.resolve(getNetworkInfo()),getBatteryInfo(),getMediaDevicesInfo(),hashText(getStableDeviceSecret())]).then(function(all){ return {
      userAgent:nav.userAgent||"", language:nav.language||"", languages:Array.isArray(nav.languages)?nav.languages.slice(0,12):[], platform:nav.platform||"", vendor:nav.vendor||"", hardwareConcurrency:nav.hardwareConcurrency||"", deviceMemory:nav.deviceMemory||"", maxTouchPoints:nav.maxTouchPoints||"", cookieEnabled:nav.cookieEnabled, webdriver:!!nav.webdriver, doNotTrack:nav.doNotTrack||window.doNotTrack||"", timezone:tz, timezoneOffset:new Date().getTimezoneOffset(), colorScheme:colorScheme, reducedMotion:reducedMotion, intl:getIntlInfo(), screen:{ width:scr.width||"", height:scr.height||"", availWidth:scr.availWidth||"", availHeight:scr.availHeight||"", colorDepth:scr.colorDepth||"", pixelDepth:scr.pixelDepth||"", devicePixelRatio:window.devicePixelRatio||"", orientation:scr.orientation&&scr.orientation.type||"" }, viewport:{ innerWidth:window.innerWidth||"", innerHeight:window.innerHeight||"", outerWidth:window.outerWidth||"", outerHeight:window.outerHeight||"", clientWidth:document.documentElement&&document.documentElement.clientWidth||"", clientHeight:document.documentElement&&document.documentElement.clientHeight||"", visualWidth:vv.width||"", visualHeight:vv.height||"", visualScale:vv.scale||"" }, webgl:all[3]||{}, clientHints:all[5]||{}, mediaFeatures:getMediaFeatures(), storage:all[6]||{}, keyboard:all[7]||{}, capabilities:all[8]||{}, network:all[9]||{}, battery:all[10]||{}, mediaDevices:all[11]||{}, canvasHash:all[0]||"", audioHash:all[1]||"", fontsHash:all[2]||"", pluginsHash:all[4]||"", deviceInstanceHash:all[12]||"" } });
  }
  function maybeLearn(){
    if(shouldSkipPage()) return;
    var uid=localGet(ID_KEY)||cookieGet(ID_KEY); var name=cleanName(localGet(NAME_KEY)||cookieGet(NAME_KEY)); if(!uid||!name) return;
    var now=Date.now(), prior={}; try{ prior=JSON.parse(localGet(LEARN_KEY)||"{}"); }catch{}
    var sig=uid+"|"+name+"|trusted-v1";
    if(prior&&prior.sig===sig&&Number(prior.ts||0)&&(now-Number(prior.ts||0))<LEARN_EVERY_MS) return;
    collectDeviceFingerprint().then(function(device_fingerprint){ return fetch("/api/device-confidence-learn",{ method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ device_fingerprint:device_fingerprint }) }); }).then(function(res){ return res.json().catch(function(){return {};}).then(function(data){ if(res&&res.ok&&data&&data.trusted_device) localSet(LEARN_KEY, JSON.stringify({ sig:sig, ts:now })); }); }).catch(function(){});
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(maybeLearn,900); }); else setTimeout(maybeLearn,900);
})();
