/** @typedef {import('./index.mjs').EventBridgeCloudWatchAlarmsEvent} EventBridgeCloudWatchAlarmsEvent */

/**
 * @param {EventBridgeCloudWatchAlarmsEvent} event
 * @returns {String} A Slack channel identifier
 */
export function channel(event) {
  const name = event.detail.alarmName;

  if (name.startsWith("FATAL")) {
    return "G2QH13X62"; // #ops-fatal
  }

  if (name.startsWith("ERROR")) {
    return "G2QH6NMEH"; // #ops-error
  }

  if (name.startsWith("WARN")) {
    return "G2QHC2N7K"; // #ops-warn
  }

  if (name.startsWith("INFO")) {
    return "G2QHBL6UX"; // #ops-info
  }

  if (name.startsWith("CRITICAL")) {
    return "G2QH13X62"; // #ops-fatal
  }

  if (name.startsWith("MAJOR")) {
    return "G2QH6NMEH"; // #ops-error
  }

  if (name.startsWith("MINOR")) {
    return "G2QHC2N7K"; // #ops-warn
  }

  return "#sandbox2";
}
