// Entry point for the Insight Worker.
// TODO: Set up a KafkaJS consumer subscribed to the "vitals.logged" topic.
// On each message:
//   1. Parse the event payload (patientId, reading, timestamp)
//   2. Fetch recent readings for that patient (trend-analysis.ts)
//   3. Run rule-based detection (rules.ts)
//   4. If a notable trend is found, call Gemini for an explanation (ai.ts)
//   5. Store the resulting alert/summary
