/**
 * Inline classic script for the document head. It must run before the
 * application's renderer loads, which no module script can guarantee. React
 * Refresh installs a hook stub that does not retain renderers, and a page
 * without DevTools has no hook at all, so this records every injected
 * renderer on `hook.renderers` either way. An existing hook (the DevTools
 * extension, or a stub already present) is extended, never replaced.
 *
 * Hosts inject it; `inspector/componentSemantics/react/devtoolsHook.ts`
 * reads the renderers it records.
 */
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
