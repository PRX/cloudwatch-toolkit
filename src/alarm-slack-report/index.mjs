/** @typedef { import('@aws-sdk/client-cloudwatch').AlarmType } AlarmType */
/** @typedef { import('@aws-sdk/client-cloudwatch').StateValue } StateValue */

import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  paginateDescribeAlarmHistory,
} from "@aws-sdk/client-cloudwatch";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { ConfiguredRetryStrategy } from "@aws-sdk/util-retry";
import regions from "./regions.mjs";
// import { alarmConsole, ssoDeepLink } from "./urls.mjs";

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
    retryStrategy: new ConfiguredRetryStrategy(
      10,
      (attempt) => 100 + attempt * 1000,
    ),
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

  const params = {
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
    .replace(/\([A-Za-z0-9 _-]+\)$/, "")
    .replace(/^(FATAL|ERROR|WARN|INFO|CRITICAL|MAJOR|MINOR)/, "")
    .trim();
}

function title(alarmDetail) {
  const name = alarmDetail.AlarmName;
  const region = regions(alarmDetail.AlarmArn.split(":")[3]);
  return `${region} » ${cleanName(name)}`;
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

  const reports = [];

  const hoursAgo26 = new Date();
  hoursAgo26.setUTCHours(-26);

  // eslint-disable-next-line no-restricted-syntax
  for (const accountId of process.env.SEARCH_ACCOUNTS.split(",")) {
    // eslint-disable-next-line no-restricted-syntax
    for (const region of process.env.SEARCH_REGIONS.split(",")) {
      // eslint-disable-next-line no-await-in-loop
      const cloudwatch = await cloudWatchClient(accountId, region);

      // eslint-disable-next-line no-await-in-loop
      const data = await describeAllAlarms(cloudwatch, undefined);

      // TODO Handle composite alarms
      // eslint-disable-next-line no-restricted-syntax
      for (const alarm of data.MetricAlarms.filter(filterByName)) {
        const ts = Date.parse(alarm.StateTransitionedTimestamp);

        if (ts >= +hoursAgo26) {
          const paginator = paginateDescribeAlarmHistory(
            {
              client: cloudwatch,
            },
            {
              AlarmName: alarm.alarmName,
              HistoryItemType: "StateUpdate",
              StartDate: hoursAgo26,
              EndDate: new Date(),
            },
          );

          const alarmHistoryItems = [];
          // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
          for await (const page of paginator) {
            alarmHistoryItems.push(...page.AlarmHistoryItems);
          }

          // const history = await cloudwatch.send(
          //   new DescribeAlarmHistoryCommand(),
          // );

          const toAlarmCount = alarmHistoryItems.filter((i) =>
            i.HistorySummary.includes("to ALARM"),
          ).length;

          reports.push({
            Alarm: alarm,
            Count: toAlarmCount,
          });
        }
      }
    }
  }

  console.log(reports);

  const blocks = [];

  if (reports.length === 0) {
    return;
  }

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: ":memo: 26-Hour Alarm Report",
      emoji: true,
    },
  });

  const lines = reports.map((r) => {
    // const accountId = r.Alarm.AlarmArn.split(":")[4];
    // const url = alarmConsole(r.Alarm);
    // const ssoUrl = ssoDeepLink(accountId, url);

    return `*${title(r.Alarm)}*: \`${r.Count}\``;
    // return `*<${ssoUrl}|${title(r.Alarm)}>*`;
  });

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: lines.join("\n"),
    },
  });

  await eventbridge.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: "org.prx.cloudwatch-alarm-reminders",
          DetailType: "Slack Message Relay Message Payload",
          Detail: JSON.stringify({
            username: "Amazon CloudWatch Alarms",
            icon_emoji: ":ops-cloudwatch-alarm:",
            // channel: "G2QHBL6UX", // #ops-info
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
