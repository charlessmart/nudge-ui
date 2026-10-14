/** Must run before the application's renderer loads; extends any existing DevTools hook and never replaces it. */
export const REACT_RENDERER_CAPTURE_SCRIPT = [
  "(function(w){",
  "var h=w.__REACT_DEVTOOLS_GLOBAL_HOOK__;",
  "if(!h){var n=0;h=w.__REACT_DEVTOOLS_GLOBAL_HOOK__={renderers:new Map(),supportsFiber:true,",
  "inject:function(i){var id=n++;h.renderers.set(id,i);return id},",
  "onScheduleFiberRoot:function(){},onCommitFiberRoot:function(){},onCommitFiberUnmount:function(){}};return}",
  "if(h.__nudgeUiRendererCapture||typeof h.inject!=='function'||!(h.renderers instanceof Map))return;",
  "h.__nudgeUiRendererCapture=true;var inject=h.inject;",
  "h.inject=function(i){var id=inject.apply(this,arguments);if(!h.renderers.has(id))h.renderers.set(id,i);return id}",
  "})(window);",
].join("");
