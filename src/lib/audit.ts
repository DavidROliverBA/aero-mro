// Single write-path for the audit trail. Every state-changing act in the app
// goes through here so the row shape exists exactly once (145-style evidence
// trail — five hand-rolled inserts was a compliance-integrity risk).

import { supabase } from "./supabase";

export async function logAudit(
  entity: string,
  action: string,
  actor: string,
  detail: string,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({ entity, action, actor, detail });
  if (error) throw error;
}
