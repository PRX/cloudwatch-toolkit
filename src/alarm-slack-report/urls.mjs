/**
 * Creates a deep link to an AWS Console URL in a specific account, using an
 * IAM Identity Center access role
 * @param {String} accountId
 * @param {String} url
 * @returns
 */
export function ssoDeepLink(accountId, url) {
  const deepLinkRoleName = "AdministratorAccess";
  const urlEncodedUrl = encodeURIComponent(url);
  return `https://d-906713e952.awsapps.com/start/#/console?account_id=${accountId}&role_name=${deepLinkRoleName}&destination=${urlEncodedUrl}`;
}

/**
 * Returns a URL to CloudWatch Alarms console for the alarm that triggered
 * the event.
 * @param {*} alarmDetail
 * @returns {String}
 */
export function alarmConsole(alarmDetail) {
  const name = alarmDetail.AlarmName;
  const region = alarmDetail.AlarmArn.split(":")[3];
  const encoded = encodeURI(name.replace(/ /g, "+")).replace(/%/g, "$");
  return `https://console.aws.amazon.com/cloudwatch/home?region=${region}#alarmsV2:alarm/${encoded}`;
}
