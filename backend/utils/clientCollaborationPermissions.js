export const CLIENT_COLLABORATION_DENIED = Object.freeze({
  commentaires_clients: false,
  rappels_clients: false,
});

export function normalizePermissionFlag(value) {
  return value === true || value === 1 || value === '1';
}

export function normalizeClientCollaborationPermissions(user) {
  if (!user?.role || user?.type_compte != null) {
    return { ...CLIENT_COLLABORATION_DENIED };
  }

  if (user.role === 'PDG') {
    return { commentaires_clients: true, rappels_clients: true };
  }

  return {
    commentaires_clients: normalizePermissionFlag(user.acces_commentaires_clients),
    rappels_clients: normalizePermissionFlag(user.acces_rappels_clients),
  };
}

export function parseStrictClientCollaborationPermissions(body) {
  const comments = body?.commentaires_clients;
  const reminders = body?.rappels_clients;
  if (typeof comments !== 'boolean' || typeof reminders !== 'boolean') {
    return {
      valid: false,
      error: 'Les permissions commentaires_clients et rappels_clients doivent être des booléens.',
    };
  }
  return {
    valid: true,
    permissions: {
      commentaires_clients: comments,
      rappels_clients: reminders,
    },
  };
}

export function hasClientCommentsAccess(user) {
  return normalizeClientCollaborationPermissions(user).commentaires_clients;
}

export function hasClientRemindersAccess(user) {
  return normalizeClientCollaborationPermissions(user).rappels_clients;
}

