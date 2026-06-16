/*
  Groupie — Google Group admin toolbox
  (Source-group actions: Duplicate / Change Setting / Copy All Settings,
   plus a Directory table with listing status + toggle per group)

  SETUP:
  1. Set the `domain` constant below to your Google Workspace domain.
     (This is the ONLY place the domain is configured — it is injected
     into the client UI, placeholder text, and validation regex.)
  2. In the Apps Script editor (Editor > Services +), add these Advanced
     Google Services, and enable the matching APIs in the linked Google
     Cloud project if prompted:
       - Admin SDK API           (identifier: AdminDirectory)
       - Groups Settings API     (identifier: AdminGroupsSettings)
  3. Deploy > New deployment > Web app:
       - Execute as:     "User accessing the web app"
       - Who has access: anyone in your domain you trust to open it.
         Every visitor must themselves be a Workspace admin with group
         management privileges — all API calls run as the visitor.

  OAuth scopes (auto-requested from advanced-service usage):
    https://www.googleapis.com/auth/admin.directory.group
    https://www.googleapis.com/auth/apps.groups.settings
*/

const domain = "yourdomain.com";
const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

// Private validator — dedupes the email check the four originals copy-pasted.
// Trailing underscore keeps it un-callable from google.script.run.
function checkGroupId_(groupId) {
  if (!groupId || typeof groupId != "string" || !emailRegex.test(groupId.toLowerCase())) {
    throw 'Please call this function with a Google Group ID';
  }
}

function doGet() {
  const template = HtmlService.createTemplateFromFile('index.html');
  template.domain = domain;
  return template.evaluate().setTitle('Groupie');
}

// https://developers.google.com/apps-script/advanced/admin-sdk-directory#list_all_groups
function getAllGroups() {
  let groups = [];
  let pageToken, page;
  do {
    page = AdminDirectory.Groups.list({
      "domain": domain,
      "pageToken": pageToken
    });
    groups = groups.concat(page.groups || []);
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (!groups.length) throw 'No groups found.';
  return groups;
}

function getGroupSettings(groupId) {
  checkGroupId_(groupId);
  return AdminGroupsSettings.Groups.get(groupId);
}

// Subsumes the unlister's showGroupInDirectory: call with
// ('includeInGlobalAddressList', 'true'|'false'). Read-modify-write of the
// full resource; returns the patched settings so the client can re-render
// without a re-fetch.
function setGroupSetting(groupId, settingToChange, newSetting) {
  checkGroupId_(groupId);
  const group = AdminGroupsSettings.Groups.get(groupId);
  group[settingToChange] = newSetting;
  return AdminGroupsSettings.Groups.patch(group, groupId);
}

function copySettings(groupIdToCopyFrom, groupIdToCopyTo, copyDescription) {
  checkGroupId_(groupIdToCopyFrom);
  checkGroupId_(groupIdToCopyTo);
  const settingsToCopy = AdminGroupsSettings.Groups.get(groupIdToCopyFrom);
  const existingSettings = AdminGroupsSettings.Groups.get(groupIdToCopyTo);
  settingsToCopy.email = existingSettings.email;
  settingsToCopy.name = existingSettings.name;
  if (!copyDescription) settingsToCopy.description = existingSettings.description;
  return AdminGroupsSettings.Groups.update(settingsToCopy, groupIdToCopyTo);
}

function copyGroup(groupIdToCopyFrom, newGroupId, newGroupName, newGroupDescription) {
  checkGroupId_(groupIdToCopyFrom);
  checkGroupId_(newGroupId);
  AdminDirectory.Groups.insert({ "email": newGroupId, "name": newGroupName, "description": newGroupDescription });
  Utilities.sleep(1000); // Admin SDK is eventually consistent; let the new group settle.
  // copyDescription=false preserves the freshly inserted email/name/description
  // (the user's overrides) and clones every other setting.
  return copySettings(groupIdToCopyFrom, newGroupId, false);
}
