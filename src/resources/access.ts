import { HttpTransport } from "../transport/HttpTransport.js";
import { HttpError } from "../errors/index.js";
import type { AccessCheckRequest, AccessDecision } from "../types/access.js";

/**
 * Resource client for evaluating access control decisions with GuildPass Core.
 */
export class AccessResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly defaultHeaders: Readonly<Record<string, string>> = {},
  ) {}

  /**
   * Evaluates whether an account is authorized to access a given resource or perform an action within a guild.
   *
   * Note: Policy evaluation remains the sole responsibility of GuildPass Core.
   * The SDK transmits the parameters, normalizes the structured decision, and handles transport errors.
   *
   * @param request - The strongly typed access evaluation query.
   * @returns Structured AccessDecision indicating allowed status and explainable reason.
   * @throws {HttpError} On API failures (4xx/5xx other than access denial).
   * @throws {NetworkError} On connection or DNS failures.
   * @throws {TimeoutError} When request exceeds configured timeout.
   */
  public async check(request: AccessCheckRequest): Promise<AccessDecision> {
    if (!request || typeof request !== "object") {
      throw new Error("AccessCheckRequest must be an object");
    }

    if (!request.guildId || typeof request.guildId !== "string" || !request.guildId.trim()) {
      throw new Error("guildId is required and must be a non-empty string");
    }

    if (!request.account || typeof request.account !== "string" || !request.account.trim()) {
      throw new Error("account is required and must be a non-empty string");
    }

    const payload: Record<string, unknown> = {
      guildId: request.guildId.trim(),
      account: request.account.trim(),
    };

    if (request.resource !== undefined) {
      payload.resource = request.resource;
    }

    if (request.action !== undefined) {
      payload.action = request.action;
    }

    if (request.context !== undefined) {
      payload.context = request.context;
    }

    try {
      const response = await this.transport.request<AccessDecision | { decision: AccessDecision }>({
        method: "POST",
        path: "/access/check",
        headers: { ...this.defaultHeaders },
        body: payload,
      });

      // Handle both direct AccessDecision and { decision: AccessDecision } Core response formats
      const decision: any =
        response && typeof response === "object" && "decision" in response
          ? (response as any).decision
          : response;

      return {
        allowed: Boolean(decision?.allowed),
        ...(decision?.reason ? { reason: String(decision.reason) } : {}),
        ...(decision?.guildId
          ? { guildId: String(decision.guildId) }
          : { guildId: request.guildId.trim() }),
        ...(decision?.account
          ? { account: String(decision.account) }
          : { account: request.account.trim() }),
        ...(decision?.resource
          ? { resource: String(decision.resource) }
          : request.resource !== undefined
            ? { resource: request.resource }
            : {}),
        ...(decision?.action
          ? { action: String(decision.action) }
          : request.action !== undefined
            ? { action: request.action }
            : {}),
        ...(decision?.metadata && typeof decision.metadata === "object"
          ? { metadata: decision.metadata }
          : {}),
      };
    } catch (error: unknown) {
      // Acceptance criteria:
      // "Denied access is represented as a normal decision where appropriate rather than always throwing."
      if (error instanceof HttpError && error.status === 403) {
        const meta = error.metadata as Record<string, unknown> | undefined;
        let reason = "access_denied";
        let decisionMetadata: Record<string, unknown> | undefined;

        if (meta && typeof meta === "object") {
          if (typeof meta.reason === "string") {
            reason = meta.reason;
          } else if (typeof meta.message === "string") {
            reason = meta.message;
          } else if (typeof meta.error === "string") {
            reason = meta.error;
          }

          if (typeof meta.metadata === "object" && meta.metadata !== null) {
            decisionMetadata = meta.metadata as Record<string, unknown>;
          } else {
            const { reason: _r, message: _m, error: _e, status: _s, allowed: _a, ...rest } = meta;
            if (Object.keys(rest).length > 0) {
              decisionMetadata = rest;
            }
          }
        }

        return {
          allowed: false,
          reason,
          guildId: request.guildId.trim(),
          account: request.account.trim(),
          ...(request.resource !== undefined ? { resource: request.resource } : {}),
          ...(request.action !== undefined ? { action: request.action } : {}),
          ...(decisionMetadata ? { metadata: decisionMetadata } : {}),
        };
      }

      // Acceptance criteria:
      // "Transport/API failures still use typed SDK errors."
      throw error;
    }
  }
}
