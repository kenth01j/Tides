const AuditLog = require('../models/AuditLog');

async function recordAudit(req, action, targetType, targetId, details = {}) {
  await AuditLog.create({
    actor: req.user._id || req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    action,
    targetType,
    targetId: String(targetId),
    details
  });
}

module.exports = { recordAudit };
