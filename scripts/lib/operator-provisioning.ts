interface OperatorStatusRequest {
  requestId: string;
  authUserId: string;
  status: 'active' | 'suspended';
  requestedBy: string;
  reason: string;
}

const fields = ['requestId', 'authUserId', 'status', 'requestedBy', 'reason'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}

/** E literals escape backslashes as well as quotes, independent of session string settings. */
function literal(value: string): string {
  return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

/** Prepare a reviewed private command; this function never connects or changes access. */
export function prepareOperatorStatusChange(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid operator status request');
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== fields.length ||
    fields.some((field) => !(field in input)) ||
    typeof input.requestId !== 'string' ||
    !uuid.test(input.requestId) ||
    typeof input.authUserId !== 'string' ||
    !uuid.test(input.authUserId) ||
    (input.status !== 'active' && input.status !== 'suspended') ||
    !text(input.requestedBy, 160) ||
    !text(input.reason, 500)
  ) {
    throw new Error('Invalid operator status request');
  }
  const request = input as unknown as OperatorStatusRequest;
  return `SELECT ops.set_operator_status(\n  ${literal(request.requestId)}::uuid,\n  ${literal(request.authUserId)}::uuid,\n  ${literal(request.status)},\n  ${literal(request.requestedBy)},\n  ${literal(request.reason)}\n) AS receipt;\n`;
}
