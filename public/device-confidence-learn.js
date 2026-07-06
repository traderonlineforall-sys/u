(function(){
  "use strict";

  var LEARN_KEY = "sr_device_confidence_learned_v4";
  var TRY_KEY = "sr_device_confidence_last_try_v4";
  var LEARN_EVERY_MS = 1000 * 60 * 60 * 24 * 30; // successful learn refresh: monthly
  var RETRY_AFTER_MS = 1000 * 60 * 10; // failed/unauthenticated retry: at most once per 10 minutes

  function localGet(k){ try { return localStorage.getItem(k) || ""; } catch { return ""; } }
  function localSet(k, v){ try { localStorage.setItem(k, v); } catch {} }
  function now(){ return Date.now(); }
  function shouldSkipPage(){
    var p = String(location.pathname || "");
    return p === "/login" || p === "/logout" || p.indexOf("/api/") === 0;
  }
  function recently(key, ms){
    var t = Number(localGet(key) || 0);
    return t && (now() - t) < ms;
  }
  function hashText(input){
    var s = String(input || "");
    if(window.crypto && crypto.subtle && window.TextEncoder){
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function(buf){
        return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,"0"); }).join("");
      }).catch(function(){ return fallbackHash(s); });
    }
    return Promise.resolve(fallbackHash(s));
  }
  function fallbackHash(s){
    var h = 2166136261;
    for(var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8,"0");
  }
  function getCanvasHash(){
    try{
      var c = document.createElement("canvas");
      c.width = 280; c.height = 90;
      var ctx = c.getContext("2d");
      if(!ctx) return Promise.resolve("");
      ctx.textBaseline = "top";
      ctx.font = "16px Arial";
      ctx.fillStyle = "#102030";
      ctx.fillText("SR Tool عقرب الصحراء 0123456789", 6, 8);
      ctx.font = "18px serif";
      ctx.strokeText("device-confidence", 16, 44);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgb(255,0,255)";
      ctx.beginPath(); ctx.arc(180,45,24,0,Math.PI*2); ctx.fill();
      return hashText(c.toDataURL());
    }catch{ return Promise.resolve(""); }
  }
  function getFontsHash(){
    try{
      var c = document.createElement("canvas");
      var ctx = c.getContext("2d");
      if(!ctx) return Promise.resolve("");
      var fonts = ["Arial","Tahoma","Times New Roman","Courier New","Verdana","Georgia","Segoe UI","Roboto","Open Sans","Calibri","Cambria","Noto Sans Arabic"];
      var txt = "SR Tool عقرب الصحراء 0123456789";
      var widths = fonts.map(function(font){
        ctx.font = "16px " + font + ", monospace";
        return font + ":" + (Math.round(ctx.measureText(txt).width * 100) / 100);
      }).join("|");
      return hashText(widths);
    }catch{ return Promise.resolve(""); }
  }
  function getWebglInfo(){
    try{
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if(!gl) return Promise.resolve({});
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      var vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      var renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      var ext = (gl.getSupportedExtensions && gl.getSupportedExtensions()) || [];
      var params = [
        gl.getParameter(gl.VERSION),
        gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
      ].join("|");
      return Promise.all([hashText(ext.sort().join("|")), hashText(params)]).then(function(h){
        return {
          vendor:String(vendor || ""),
          renderer:String(renderer || ""),
          version:String(gl.getParameter(gl.VERSION) || ""),
          shadingLanguageVersion:String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ""),
          maxTextureSize:String(gl.getParameter(gl.MAX_TEXTURE_SIZE) || ""),
          extensionsHash:h[0],
          paramsHash:h[1]
        };
      });
    }catch{ return Promise.resolve({}); }
  }
  function collectDeviceFingerprint(){
    var nav = navigator || {};
    var scr = screen || {};
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    var plugins = "";
    try { plugins = Array.from(nav.plugins || []).map(function(p){ return p.name + ":" + p.filename + ":" + p.description; }).slice(0,40).join("|"); } catch {}
    var colorScheme = "";
    try { colorScheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch {}
    var reducedMotion = "";
    try { reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference"; } catch {}
    return Promise.all([getCanvasHash(), getFontsHash(), getWebglInfo(), hashText(plugins)]).then(function(all){
      return {
        userAgent: nav.userAgent || "",
        language: nav.language || "",
        languages: Array.isArray(nav.languages) ? nav.languages.slice(0,12) : [],
        platform: nav.platform || "",
        vendor: nav.vendor || "",
        hardwareConcurrency: nav.hardwareConcurrency || "",
        deviceMemory: nav.deviceMemory || "",
        maxTouchPoints: nav.maxTouchPoints || "",
        cookieEnabled: nav.cookieEnabled,
        doNotTrack: nav.doNotTrack || window.doNotTrack || "",
        timezone: tz,
        timezoneOffset: new Date().getTimezoneOffset(),
        colorScheme: colorScheme,
        reducedMotion: reducedMotion,
        screen: {
          width: scr.width || "",
          height: scr.height || "",
          availWidth: scr.availWidth || "",
          availHeight: scr.availHeight || "",
          colorDepth: scr.colorDepth || "",
          pixelDepth: scr.pixelDepth || "",
          devicePixelRatio: window.devicePixelRatio || "",
          orientation: scr.orientation && scr.orientation.type || ""
        },
        webgl: all[2] || {},
        canvasHash: all[0] || "",
        fontsHash: all[1] || "",
        pluginsHash: all[3] || ""
      };
    });
  }
  function maybeLearn(){
    if(shouldSkipPage()) return;
    if(recently(LEARN_KEY, LEARN_EVERY_MS)) return;
    if(recently(TRY_KEY, RETRY_AFTER_MS)) return;
    localSet(TRY_KEY, String(now()));

    collectDeviceFingerprint().then(function(device_fingerprint){
      return fetch("/api/device-confidence-learn", {
        method:"POST",
        credentials:"same-origin",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ device_fingerprint:device_fingerprint })
      });
    }).then(function(res){
      return res ? res.json().catch(function(){ return {}; }).then(function(data){ return {res:res, data:data}; }) : {res:null, data:{}};
    }).then(function(out){
      if(out && out.res && out.res.ok && out.data && out.data.learned){
        localSet(LEARN_KEY, String(now()));
        try { window.dispatchEvent(new CustomEvent("sr-device-confidence-learned", { detail: out.data })); } catch {}
      }
    }).catch(function(){
      // Silent by design: this must never block the tool.
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(maybeLearn, 1200); });
  else setTimeout(maybeLearn, 1200);
})();
