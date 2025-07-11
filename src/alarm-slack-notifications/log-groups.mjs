/** @typedef {import('./index.mjs').EventBridgeCloudWatchAlarmsEvent} EventBridgeCloudWatchAlarmsEvent */
/** @typedef {import('@aws-sdk/client-cloudwatch').DescribeAlarmsOutput} DescribeAlarmsOutput */
/** @typedef {import('@aws-sdk/client-cloudwatch').DescribeAlarmHistoryOutput} DescribeAlarmHistoryOutput */
/** @typedef {import('@aws-sdk/client-cloudwatch').ListTagsForResourceOutput} ListTagsForResourceOutput */

// Alarms with certain namespaces can look up a log group from their resource
// tags, when there's no way to infer the log group from the alarm's
// configuration. This could include any namespaces, but it's limited to only
// those actively employing this strategy, to limit unnecessary API requests.
const TAGGED = [
  // AWS/Lambda included by default
  // AWS/States included by default
  "AWS/ApplicationELB",
  "PRX/Dovetail/Router",
  "PRX/Dovetail/Legacy",
  "PRX/Dovetail/Counts",
  "PRX/Dovetail/Analytics",
  "PRX/Augury",
  "PRX/Feeder",
  "PRX/Clickhouse",
];

/**
 * Returns the name of a log group associated with the alarm that triggerd
 * and event.
 * @param {EventBridgeCloudWatchAlarmsEvent} _event
 * @param {DescribeAlarmsOutput} desc
 * @param {ListTagsForResourceOutput} tagList
 * @returns {Promise<String>}
 */
export async function logGroupName(_event, desc, tagList) {
  // For Lambda alarms, look for a FunctionName dimension, and use that name
  // to construct the log group name
  if (
    desc?.MetricAlarms?.[0]?.Namespace === "AWS/Lambda" &&
    desc?.MetricAlarms?.[0]?.Dimensions?.length
  ) {
    const functionDimension = desc.MetricAlarms[0].Dimensions.find(
      (d) => d.Name === "FunctionName",
    );

    if (functionDimension) {
      return `/aws/lambda/${functionDimension.Value}`;
    }
  }
  // For Step Function alarms for Lambda states, look for a LambdaFunctionArn
  // dimension, and use that to construct the log group name
  else if (
    desc?.MetricAlarms?.[0]?.Namespace === "AWS/States" &&
    desc?.MetricAlarms?.[0]?.Dimensions?.length
  ) {
    const functionDimension = desc.MetricAlarms[0].Dimensions.find(
      (d) => d.Name === "LambdaFunctionArn",
    );

    if (functionDimension) {
      return `/aws/lambda/${functionDimension.Value.split(":function:")[1]}`;
    }
  }
  // If the alarm belongs to one of the namespaces that is listed above,
  // the tags on the alarm should be inspected to see if an explicit log
  // group name is specified. If so, use that.
  else if (TAGGED.includes(desc?.MetricAlarms?.[0]?.Namespace)) {
    const logGroupNameTag = tagList?.Tags?.find(
      (t) => t.Key === "prx:ops:cloudwatch-log-group-name",
    );

    if (logGroupNameTag) {
      return logGroupNameTag.Value;
    }
  }

  return undefined;
}
