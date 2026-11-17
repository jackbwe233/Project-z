/** Keep failed/empty local-model replies honest without another risky GPU attempt. */
export function finalizeChatReply({ output = "", raw = "", thinking = "", aborted = false, error = null } = {}) {
  // Never expose raw internal thinking if the parser produced no answer.
  const visible = String(output || (!thinking ? raw : "") || "").trim();
  if (aborted) {
    return visible ? visible + "\n\n_(Stopped before completion.)_" : "(Stopped. You can try again.)";
  }
  if (error) {
    return visible
      ? visible + "\n\n_(The reply was interrupted by an error and may be incomplete. Try again.)_"
      : "_Z couldn't finish that reply. Try again, or reload the model if it keeps happening._";
  }
  return visible || "_Z didn't produce an answer. Try again; if this repeats, reload the model._";
}
