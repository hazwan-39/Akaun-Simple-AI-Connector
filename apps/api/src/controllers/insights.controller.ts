import { CASH_FLOW_SKILL_ID, GenerateInsightsRequestSchema, getSkill } from "@akaun/shared";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import type { DailyQuota } from "../security/quota.js";
import { runCashFlowSkill, type SkillDeps } from "../skills/cashflow/run.js";

export function insightsController(deps: SkillDeps & { quota: DailyQuota }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const skill = getSkill(req.params.skillId ?? "");
      if (!skill) throw new AppError("NOT_FOUND");
      if (skill.status !== "enabled" || skill.id !== CASH_FLOW_SKILL_ID) throw new AppError("FORBIDDEN", "skill not enabled");

      const parsed = GenerateInsightsRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("INVALID_REQUEST", parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")).join(","));
      }

      const keyLabel = req.pilotKeyLabel!;
      if (!deps.quota.tryConsume(keyLabel)) throw new AppError("QUOTA_EXCEEDED");
      try {
        const result = await runCashFlowSkill(deps, parsed.data.summary, { requestId: req.requestId ?? "-" });
        res.setHeader("X-Quota-Remaining", String(deps.quota.remaining(keyLabel)));
        res.json(result);
      } catch (err) {
        // Do not charge the pilot user's quota when we could not deliver a result.
        deps.quota.refund(keyLabel);
        throw err;
      }
    } catch (err) {
      next(err);
    }
  };
}
