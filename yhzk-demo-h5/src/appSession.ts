export interface SessionExitActions {
  interruptDigitalHuman: () => void;
  clearAuthentication: () => void;
  refreshView: () => void;
  showLogin: () => void;
}

/**
 * Leave the authenticated area in a fixed order so a refresh cannot restore
 * a user to a protected screen with stale credentials.
 */
export function exitAuthenticatedSession(actions: SessionExitActions): void {
  actions.interruptDigitalHuman();
  actions.clearAuthentication();
  actions.refreshView();
  actions.showLogin();
}
