export { VerificationFeature } from "./components/VerificationFeature";
export { VerificationConfigFeature } from "./components/VerificationConfigFeature";
// Read-only lookup for cross-feature status checks (e.g. raid-detection).
// Writes stay behind actions.ts — never export saveVerificationConfig here.
export { getVerificationConfig } from "./queries";
export { saveVerificationConfigAction, setupVerificationAction, teardownVerificationAction } from "./actions";
export type { VerificationConfig, CaptchaType } from "./types";
