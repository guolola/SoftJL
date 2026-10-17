// Preserves the source feedback component's telemetry contract without contacting the upstream website.
const ignore = (_properties: unknown) => {};
export const analytics = { assistant: { feedbackShown: ignore, feedbackClicked: ignore, feedbackSubmitted: ignore, feedbackSubmitFailed: ignore } };
