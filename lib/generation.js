import { REPETITION_MESSAGE } from './repetition-guard.js';
/** @file Generation error classification. */

export function isGenerationAbortError(err) {
  return err?.name === "AbortError" || String(err?.message || "").toLowerCase().includes("abort");
}

export function isWebGpuDeviceFailure(err) {
  const message = String(err?.message || err || "");
  return /device(?:\\.|_)?createCommandEncoder|createCommandEncoder|GPUDevice.*(?:lost|destroyed)|device lost|GPU device was lost/i.test(message);
}

function generationFailureCopy(err) {
  const technicalMessage = String(err?.message || err);
  const contextMatch = technicalMessage.match(
    /current turn requires ([\d,]+) input tokens, but this model allows ([\d,]+) after reserving output space/i,
  );
  if (contextMatch) {
    const [, required, available] = contextMatch;
    return {
      message:
        `This turn is too large for the model (${required} input tokens; ${available} available). `
        + "Use grep or read a smaller range, or start a new conversation.",
      toast: "This turn is too large for the model. Use a smaller file range.",
    };
  }

  if (isWebGpuDeviceFailure(err)) {
    return {
      message: "The graphics device failed while running Z. Your chat is saved. Reload this page to recreate the GPU device, then load the lightweight model again. If this continues, close other heavy apps or try another supported browser.",
      toast: "WebGPU device error. Reload Z before using the model again.",
    };
  }

  if (/No supported WebGPU variant for\s+\S+/i.test(technicalMessage)) {
    return {
      message:
        "The model could not process this prompt because its WebGPU runtime has no compatible "
        + "kernel for this input shape. This is not necessarily a context-window overflow. "
        + "Try grep first or read a smaller range, such as 50–100 lines.",
      toast: "WebGPU could not process this prompt shape. Try a smaller file range.",
    };
  }

  return {
    message: technicalMessage,
    toast: `Generation failed: ${technicalMessage}`,
  };
}

export function generationErrorFallback(err, { raw = "" } = {}) {
  if (err?.name === 'RepetitionError') {
    return { raw: REPETITION_MESSAGE, aborted: false, toast: 'Stopped a repeating reply. Try a new conversation or another model.' };
  }
  const aborted = isGenerationAbortError(err);
  const failure = aborted ? null : generationFailureCopy(err);
  if (raw) {
    return {
      raw,
      aborted,
      toast: aborted ? "Stopped generating" : failure.toast,
    };
  }
  return {
    raw: aborted ? "(stopped)" : `_Error: ${failure.message}_`,
    aborted,
    toast: aborted ? "Stopped generating" : failure.toast,
  };
}
