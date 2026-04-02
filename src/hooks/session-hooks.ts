import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { HookModuleContext } from "../hook-context";
import type {
  HookExecutionContext,
  HookMatcherValue,
  HookRunResult,
  NotifyFn,
  SettingsFile,
} from "../types";
import { triggerSimpleHooks } from "./shared";

export async function triggerSessionHooks(
  eventName: "SessionStart" | "SessionEnd",
  matcherValue: HookMatcherValue<"SessionStart"> | HookMatcherValue<"SessionEnd">,
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<HookRunResult> {
  return triggerSimpleHooks(eventName, matcherValue, context, settings, notify);
}

export function registerSessionHooks(
  pi: ExtensionAPI,
  shared: HookModuleContext,
) {
  // SessionStart 映射：
  // startup -> resources_discover(reason="startup")
  // startup -> session_switch(reason="new")
  // resume -> session_switch(reason="resume")
  // compact -> session_compact
  //
  // SessionEnd 映射：
  // other -> session_shutdown
  //
  // 当前 pi 版本中，初次启动和 /reload 都会发出不带 reason 的 session_start，
  // 但 resources_discover 会明确区分 startup / reload。
  // 因此这里让 session_start 只负责初始化，真正的 startup hook 在
  // resources_discover(reason="startup") 中触发，避免和 /reload 混淆。
  pi.on("session_start", async (_event, ctx) => {
    shared.initSettings(ctx.cwd);
  });

  pi.on("resources_discover", async (event, ctx) => {
    if (event.reason === "startup") {
      await shared.triggerSessionStartHook("startup", ctx);
    }

    return {};
  });

  pi.on("session_switch", async (event, ctx) => {
    const reason = (event as { reason?: string }).reason ?? "";

    if (reason === "new") {
      await shared.triggerSessionStartHook("startup", ctx);
      return;
    }

    if (reason === "resume") {
      await shared.triggerSessionStartHook("resume", ctx);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const reason = "other";

    // SessionEnd 固定由 session_shutdown 触发，matcher 仅使用 other。
    await triggerSessionHooks(
      "SessionEnd",
      reason,
      {
        sessionId: shared.getSessionId(ctx),
        cwd: ctx.cwd,
        hookEventName: "SessionEnd",
        reason,
      },
      shared.currentSettings,
      (msg, type) => shared.notify(ctx, msg, type),
    );
  });
}
