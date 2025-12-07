/*
 * role-utils.js
 * Shared helpers for interpreting and updating user role state across the site.
 * All helpers attach to window.RoleUtils for both classic scripts and modules.
 */
(function initRoleUtils(global) {
  var ROLE_STATES = Object.freeze({
    STUDENT_ONLY: 'student_only',
    TUTOR_ONLY: 'tutor_only',
    HYBRID_ACTIVE: 'hybrid_active',
    HYBRID_FREEZE_TUTOR: 'hybrid_freeze_tutor',
    HYBRID_FREEZE_STUDENT: 'hybrid_freeze_student',
    TUTOR_PENDING: 'tutor_pending'
  });

  function coerceRoleFlags(rawValue) {
    var base = {
      active: false,
      frozen: false,
      pending: false,
      approvedAt: null,
      frozenAt: null,
      lastUpdatedAt: null,
      pendingAt: null
    };

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      base.active = Boolean(rawValue.active || rawValue.enabled || rawValue === true);
      if (rawValue.frozen !== undefined) {
        base.frozen = Boolean(rawValue.frozen);
      } else if (rawValue.active === false && rawValue.frozenAt) {
        base.frozen = true;
      }
      base.pending = Boolean(rawValue.pending);
      base.approvedAt = rawValue.approvedAt || null;
      base.frozenAt = rawValue.frozenAt || null;
      base.lastUpdatedAt = rawValue.lastUpdatedAt || null;
      base.pendingAt = rawValue.pendingAt || null;
      return base;
    }

    if (rawValue === true) {
      base.active = true;
      return base;
    }

    if (rawValue === false) {
      base.frozen = true;
      return base;
    }

    return base;
  }

  function getRolesFromUser(userDoc) {
    if (!userDoc || typeof userDoc !== 'object') {
      return {};
    }
    return userDoc.roles && typeof userDoc.roles === 'object' ? userDoc.roles : {};
  }

  function normalizeRoleInfo(userDoc) {
    var roles = getRolesFromUser(userDoc);
    var studentFlags = coerceRoleFlags(roles.student);
    var tutorFlags = coerceRoleFlags(roles.tutor);

    var tutorPending = Boolean(tutorFlags.pending) || userDoc && userDoc.tutorPending === true;
    var tutorActive = Boolean(tutorFlags.active) && !tutorFlags.pending;
    var studentActive = Boolean(studentFlags.active);
    var tutorFrozen = Boolean(tutorFlags.frozen) || (!tutorActive && !tutorPending && (studentActive || studentFlags.frozen));
    var studentFrozen = Boolean(studentFlags.frozen) && !studentActive;

    var roleState = ROLE_STATES.STUDENT_ONLY;
    if (tutorPending) {
      roleState = ROLE_STATES.TUTOR_PENDING;
    } else if (tutorActive && studentActive) {
      roleState = ROLE_STATES.HYBRID_ACTIVE;
    } else if (tutorActive) {
      roleState = ROLE_STATES.TUTOR_ONLY;
    } else if (studentActive && tutorFrozen) {
      roleState = ROLE_STATES.HYBRID_FREEZE_TUTOR;
    } else if (tutorActive && studentFrozen) {
      roleState = ROLE_STATES.HYBRID_FREEZE_STUDENT;
    } else if (!studentActive && tutorFrozen) {
      roleState = ROLE_STATES.HYBRID_FREEZE_STUDENT;
    } else if (!tutorActive && studentFrozen && tutorFrozen) {
      roleState = ROLE_STATES.HYBRID_FREEZE_TUTOR;
    } else if (studentFrozen && !studentActive) {
      roleState = ROLE_STATES.HYBRID_FREEZE_STUDENT;
    }

    return {
      state: roleState,
      studentActive: studentActive,
      tutorActive: tutorActive,
      tutorPending: tutorPending,
      tutorFrozen: tutorFrozen,
      studentFrozen: studentFrozen,
      rolesRaw: roles
    };
  }

  function getRoleStateLabel(info) {
    if (!info) {
      return 'student';
    }
    switch (info.state) {
      case ROLE_STATES.TUTOR_ONLY:
        return 'tutor';
      case ROLE_STATES.HYBRID_ACTIVE:
        return 'hybrid';
      case ROLE_STATES.HYBRID_FREEZE_TUTOR:
        return 'hybrid_freeze_tutor';
      case ROLE_STATES.HYBRID_FREEZE_STUDENT:
        return 'hybrid_freeze_student';
      case ROLE_STATES.TUTOR_PENDING:
        return 'tutor_pending';
      default:
        return 'student';
    }
  }

  function buildRolePayload(current, overrides) {
    var source = current && typeof current === 'object' ? current : {};
    var mixins = overrides && typeof overrides === 'object' ? overrides : {};
    var now = new Date().toISOString();
    var next = Object.assign({}, source, mixins, { lastUpdatedAt: now });

    if (mixins.frozen === true) {
      next.frozenAt = now;
      next.active = false;
    } else if (mixins.frozen === false) {
      next.frozenAt = null;
      if (mixins.active === undefined) {
        next.active = true;
      }
    }

    if (mixins.pending === true) {
      next.pendingAt = now;
    } else if (mixins.pending === false) {
      next.pendingAt = null;
    }

    return next;
  }

  global.RoleUtils = {
    ROLE_STATES: ROLE_STATES,
    normalizeRoleInfo: normalizeRoleInfo,
    getRoleStateLabel: getRoleStateLabel,
    buildRolePayload: buildRolePayload
  };
})(window);
