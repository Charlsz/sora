# Permissions

Sensitive tools call `PermissionGate` before executing.

## Decisions

| Mode | Behavior |
|------|----------|
| Interactive (desktop) | SSE `permission.pending` → ApprovalCard |
| Allow once | Approve this request only |
| Allow session | Remember `agentId + action` until process restart |
| Deny | Block the tool |
| Timeout | After 5 minutes unanswered → deny (OpenMausBot-style broker) |
| `--yes` / `SORA_AUTO_APPROVE=1` | Ask treated as allow (headless) |

## Default policy

`fs.read` and some read-only browser actions allow; writes, shell, HTTP, navigation ask.

## Ops tip

Never leave `--yes` on a shared laptop. Prefer session allows for interactive coding sessions.
