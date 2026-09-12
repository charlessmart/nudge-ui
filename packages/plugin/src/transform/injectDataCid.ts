/**
 * Legacy Vite-adapter entry point for the host-neutral React identity
 * compiler. Keep this module so existing `@nudge-ui/vite-react/identity`
 * consumers continue to resolve the same API while other adapters can depend
 * on `@nudge-ui/compiler` directly.
 */
export {
  injectDataCid,
  injectIdentity,
} from "@nudge-ui/compiler/react-identity";
export type {
  InjectIdentityOptions,
  InjectResult,
} from "@nudge-ui/compiler/react-identity";
