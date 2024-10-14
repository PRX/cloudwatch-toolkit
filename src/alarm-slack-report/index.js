/** @typedef { import('@aws-sdk/client-cloudwatch').AlarmType } AlarmType */
/** @typedef { import('@aws-sdk/client-cloudwatch').StateValue } StateValue */

import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import regions from "./regions.mjs";
import { alarmConsole, ssoDeepLink } from "./urls.mjs";

const sts = new STSClient({ apiVersion: "2011-06-15" });
const eventbridge = new EventBridgeClient({ apiVersion: "2015-10-07" });

async function cloudWatchClient(accountId, region) {
  const roleName = process.env.CLOUDWATCH_CROSS_ACCOUNT_SHARING_ROLE_NAME;

  const role = await sts.send(
    new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${accountId}:role/${roleName}`,
      RoleSessionName: "reminders_lambda_reader",
    }),
  );

  return new CloudWatchClient({
    apiVersion: "2010-08-01",
    region,
    credentials: {
      accessKeyId: role.Credentials.AccessKeyId,
      secretAccessKey: role.Credentials.SecretAccessKey,
      sessionToken: role.Credentials.SessionToken,
    },
  });
}

/**
 *
 * @param {CloudWatchClient} cwClient
 * @param {string} nextToken
 * @returns {Promise<Object>}
 */
async function describeAllAlarms(cwClient, nextToken) {
  /** @type {AlarmType[]} */
  const alarmTypes = ["CompositeAlarm", "MetricAlarm"];

  /** @type {StateValue} */
  const stateValue = "ALARM";

  const params = {
    StateValue: stateValue,
    AlarmTypes: alarmTypes,
    ...(nextToken && { NextToken: nextToken }),
  };

  const data = await cwClient.send(new DescribeAlarmsCommand(params));

  const results = {
    CompositeAlarms: [],
    MetricAlarms: [],
  };

  if (data.CompositeAlarms) {
    results.CompositeAlarms.push(...data.CompositeAlarms);
  }

  if (data.MetricAlarms) {
    results.MetricAlarms.push(...data.MetricAlarms);
  }

  if (data.NextToken) {
    const more = await describeAllAlarms(cwClient, data.NextToken);

    if (more) {
      results.CompositeAlarms.push(...more.CompositeAlarms);
      results.MetricAlarms.push(...more.MetricAlarms);
    }
  }

  return results;
}

function cleanName(alarmName) {
  return alarmName
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;")
    .replace(/\([A-Za-z0-9_-]+\)$/, "")
    .replace(/^(FATAL|ERROR|WARN|INFO|CRITICAL|MAJOR|MINOR)/, "")
    .trim();
}

function title(alarmDetail) {
  const name = alarmDetail.AlarmName;
  const region = regions(alarmDetail.AlarmArn.split(":")[3]);
  return `${alarmDetail.StateValue} | ${region} » ${cleanName(name)}`;
}

function filterByName(alarm) {
  return !(
    alarm.AlarmName.includes("AS:In") ||
    alarm.AlarmName.includes("AS:Out") ||
    alarm.AlarmName.includes("TargetTracking") ||
    alarm.AlarmName.includes("ScaleInAlarm") ||
    alarm.AlarmName.includes("ScaleOutAlarm") ||
    alarm.AlarmName.includes("Production Pollers Low CPU Usage")
  );
}

export const handler = async (event) => {
  console.log(JSON.stringify(event));

  const alarms = {
    CompositeAlarms: [],
    MetricAlarms: [],
  };

  // eslint-disable-next-line no-restricted-syntax
  for (const accountId of process.env.SEARCH_ACCOUNTS.split(",")) {
    // eslint-disable-next-line no-restricted-syntax
    for (const region of process.env.SEARCH_REGIONS.split(",")) {
      // eslint-disable-next-line no-await-in-loop
      const cloudwatch = await cloudWatchClient(accountId, region);

      // eslint-disable-next-line no-await-in-loop
      const data = await describeAllAlarms(cloudwatch, undefined);

      alarms.CompositeAlarms.push(...data.CompositeAlarms);
      alarms.MetricAlarms.push(...data.MetricAlarms.filter(filterByName));
    }
  }

  console.log(JSON.stringify(alarms));

  const count = alarms.CompositeAlarms.length + alarms.MetricAlarms.length;

  const blocks = [];

  if (count === 0) {
    return;
  }

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: ":memo: 24-Hour Alarm Report",
      emoji: true,
    },
  });

  // blocks.push(
  //   ...alarms.MetricAlarms.map((a) => {
  //     const accountId = a.AlarmArn.split(":")[4];
  //     const url = alarmConsole(a);
  //     const ssoUrl = ssoDeepLink(accountId, url);

  //     const lines = [`*<${ssoUrl}|${title(a)}>*`];

  //     if (a.StateReasonData) {
  //       const reasonData = JSON.parse(a.StateReasonData);
  //       lines.push(started(reasonData));
  //     }

  //     return {
  //       type: "section",
  //       text: {
  //         type: "mrkdwn",
  //         text: lines.join("\n"),
  //       },
  //     };
  //   }),
  // );

  await eventbridge.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: "org.prx.cloudwatch-alarm-reminders",
          DetailType: "Slack Message Relay Message Payload",
          Detail: JSON.stringify({
            username: "Amazon CloudWatch Alarms",
            icon_emoji: ":ops-cloudwatch-alarm:",
            // channel: "G2QH6NMEH", // #ops-error
            channel: "CHZTAGBM2", // #sandbox2
            attachments: [
              {
                color: "#a30200",
                fallback: `tktktk`,
                blocks,
              },
            ],
          }),
        },
      ],
    }),
  );
};
