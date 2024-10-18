/** @typedef {import('./index.mjs').EventBridgeCloudWatchAlarmsEvent} EventBridgeCloudWatchAlarmsEvent */
/** @typedef {import('@aws-sdk/client-cloudwatch').DescribeAlarmsOutput} DescribeAlarmsOutput */
/** @typedef {import('@aws-sdk/client-cloudwatch').DescribeAlarmHistoryOutput} DescribeAlarmHistoryOutput */
/** @typedef {import('@aws-sdk/client-cloudwatch').ListTagsForResourceOutput} ListTagsForResourceOutput */

import { detailLines as singleMetricDetailLines } from "./alarm/single-metric.mjs";

/**
 * @param {EventBridgeCloudWatchAlarmsEvent} event
 * @param {DescribeAlarmsOutput} desc
 * @param {DescribeAlarmHistoryOutput} history
 * @param {ListTagsForResourceOutput} tagList
 * @returns {Promise<String[]>}
 */
export async function detailLines(event, desc, history, tagList) {
  if (event.detail.configuration.metrics.length === 1) {
    return singleMetricDetailLines(event, desc, history, tagList);
  }

  return ["Unknown alarm metric type!"];
}
