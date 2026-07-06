(function(){
  "use strict";
  if(window.__srDeviceConfidenceLearnV433) return;
  window.__srDeviceConfidenceLearnV433 = true;

  var LEARN_KEY = "sr_device_confidence_learned_v433";
  var TRY_KEY = "sr_device_confidence_last_try_v433";
  var LEARN_EVERY_MS = 1000 * 60 * 60 * 24 * 30;
  var RETRY_AFTER_MS = 1000 * 60 * 2;

  function localGet(k){ try { return localStorage.getItem(k) || ""; } catch(e) { return ""; } }
  function localSet(k, v){ try { localStorage.setItem(k, v); } catch(e) {} }
  function now(){ return Date.now(); }
  function recently(key, ms){ var t = Number(localGet(key) || 0); return t && (now() - t) < ms; }
  function shouldSkipPage(){ var p = String(location.pathname || ""); return p === "/login" || p === "/logout" || p.indexOf("/api/") === 0; }
  function fallbackHash(s){ s=String(s||""); var h=2166136261; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,"0"); }
  function hashText(input){
    var s=String(input||"");
    if(window.crypto && crypto.subtle && window.TextEncoder){
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function(buf){
        return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,"0"); }).join("");
      }).catch(function(){ return fallbackHash(s); });
    }
    return Promise.resolve(fallbackHash(s));
  }
  function canvasHash(){
    try{
      var c=document.createElement("canvas"); c.width=300; c.height=90;
      var x=c.getContext("2d"); if(!x) return Promise.resolve("");
      x.textBaseline="top"; x.font="16px Arial"; x.fillStyle="#102030"; x.fillText("SR Tool عقرب الصحراء 0123456789",6,8);
      x.font="18px serif"; x.strokeText("device-confidence",16,44);
      x.globalCompositeOperation="multiply"; x.fillStyle="rgb(255,0,255)"; x.beginPath(); x.arc(190,46,24,0,Math.PI*2); x.fill();
      return hashText(c.toDataURL());
    }catch(e){ return Promise.resolve(""); }
  }
  function fontsHash(){
    try{
      var c=document.createElement("canvas"); var x=c.getContext("2d"); if(!x) return Promise.resolve("");
      var fonts=["Arial","Tahoma","Times New Roman","Courier New","Verdana","Georgia","Segoe UI","Roboto","Open Sans","Calibri","Cambria","Noto Sans Arabic"];
      var txt="SR Tool عقرب الصحراء 0123456789";
      var widths=fonts.map(function(f){ x.font="16px "+f+", monospace"; return f+":"+(Math.round(x.measureText(txt).width*100)/100); }).join("|");
      return hashText(widths);
    }catch(e){ return Promise.resolve(""); }
  }
  function webglInfo(){
    try{
      var c=document.createElement("canvas"); var gl=c.getContext("webgl") || c.getContext("experimental-webgl"); if(!gl) return Promise.resolve({});
      var dbg=gl.getExtension("WEBGL_debug_renderer_info");
      var vendor=dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      var renderer=dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      var ext=(gl.getSupportedExtensions && gl.getSupportedExtensions()) || [];
      var params=[gl.getParameter(gl.VERSION),gl.getParameter(gl.SHADING_LANGUAGE_VERSION),gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_VERTEX_ATTRIBS),gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)].join("|");
      return Promise.all([hashText(ext.sort().join("|")), hashText(params)]).then(function(h){
        return { vendor:String(vendor||""), renderer:String(renderer||""), version:String(gl.getParameter(gl.VERSION)||""), shadingLanguageVersion:String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)||""), maxTextureSize:String(gl.getParameter(gl.MAX_TEXTURE_SIZE)||""), extensionsHash:h[0], paramsHash:h[1] };
      });
    }catch(e){ return Promise.resolve({}); }
  }
  function collect(){
    var nav=navigator || {}; var scr=screen || {}; var tz="";
    try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }catch(e){}
    var plugins=""; try{ plugins=Array.from(nav.plugins||[]).map(function(p){ return p.name+":"+p.filename+":"+p.description; }).slice(0,40).join("|"); }catch(e){}
    var colorScheme=""; try{ colorScheme=matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }catch(e){}
    var reducedMotion=""; try{ reducedMotion=matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference"; }catch(e){}
    return Promise.all([canvasHash(), fontsHash(), webglInfo(), hashText(plugins)]).then(function(a){
      return { userAgent:nav.userAgent||"", language:nav.language||"", languages:Array.isArray(nav.languages)?nav.languages.slice(0,12):[], platform:nav.platform||"", vendor:nav.vendor||"", hardwareConcurrency:nav.hardwareConcurrency||"", deviceMemory:nav.deviceMemory||"", maxTouchPoints:nav.maxTouchPoints||"", cookieEnabled:nav.cookieEnabled, doNotTrack:nav.doNotTrack||window.doNotTrack||"", timezone:tz, timezoneOffset:new Date().getTimezoneOffset(), colorScheme:colorScheme, reducedMotion:reducedMotion, screen:{ width:scr.width||"", height:scr.height||"", availWidth:scr.availWidth||"", availHeight:scr.availHeight||"", colorDepth:scr.colorDepth||"", pixelDepth:scr.pixelDepth||"", devicePixelRatio:window.devicePixelRatio||"", orientation:(scr.orientation && scr.orientation.type)||"" }, webgl:a[2]||{}, canvasHash:a[0]||"", fontsHash:a[1]||"", pluginsHash:a[3]||"" };
    });
  }
  function learnNow(opts){
    opts = opts || {};
    return collect().then(function(device_fingerprint){
      return fetch("/api/device-confidence-learn", { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({ device_fingerprint:device_fingerprint, manual:!!opts.manual }) });
    }).then(function(res){ return res.json().catch(function(){ return {}; }).then(function(data){ return { status:res.status, ok:res.ok, data:data }; }); })
    .then(function(out){
      if(out.ok && out.data && out.data.learned) localSet(LEARN_KEY, String(now()));
      try{ window.dispatchEvent(new CustomEvent("sr-device-confidence-result", { detail: out })); }catch(e){}
      return out;
    });
  }
  function autoLearn(){
    if(shouldSkipPage()) return;
    if(recently(LEARN_KEY, LEARN_EVERY_MS)) return;
    if(recently(TRY_KEY, RETRY_AFTER_MS)) return;
    localSet(TRY_KEY, String(now()));
    learnNow({ manual:false }).catch(function(){});
  }
  window.SR_DEVICE_CONFIDENCE = window.SR_DEVICE_CONFIDENCE || {};
  window.SR_DEVICE_CONFIDENCE.collect = collect;
  window.SR_DEVICE_CONFIDENCE.learnNow = learnNow;
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(autoLearn, 1800); });
  else setTimeout(autoLearn, 1800);
})();
