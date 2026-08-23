// Stub. Registered at runtime rather than in the manifest: a declared content
// script needs match patterns, and those become install-time host permissions
// the MVP's permission ceiling does not allow. Selection extraction arrives in
// M5, through `activeTab` + `scripting` on a user gesture.
export default defineContentScript({
  registration: "runtime",
  matches: [],
  main() {},
});
