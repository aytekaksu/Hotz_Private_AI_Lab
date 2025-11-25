/**
 * Auth module exports.
 */

export { getAuthorizedEmail, isEmailAuthorized } from './config';
export {
  createSession,
  getSessionUser,
  getSessionUserFromRequest,
  getSession,
  getSessionFromRequest,
  markSessionMfaCompleted,
  destroySession,
  destroyAllUserSessions,
  hasValidSession,
  hasValidSessionFromRequest,
} from './session';
