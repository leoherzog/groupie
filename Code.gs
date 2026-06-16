/*
  Groupie — a single, modernized admin toolbox for Google Groups for Workspace.

  Grabs every group on your domain and gives you one place to manage them:
  Duplicate a group, Change a single Setting, Copy All Settings between groups,
  and a Groups Directory to list/unlist groups from your domain's directory.

  API calls run against the Admin SDK and require Workspace admin privileges
  over groups. Add the Admin SDK API (AdminDirectory) and Groups Settings API
  (AdminGroupsSettings) as Advanced Services, then deploy as a Web app.

  Setup, deployment models, and updates: https://github.com/leoherzog/groupie
*/

function doGet() {
  const template = HtmlService.createTemplateFromFile('index.html');
  // Auto-detected from the account the calls run as (the deployer under
  // "execute as me", or the visitor under "execute as user"). Feeds the
  // UI heading, the new-group placeholder, and the client-side ID regex.
  template.domain = Session.getEffectiveUser().getEmail().split('@').pop();
  return template.evaluate()
    .setTitle('Groupie')
    .setFaviconUrl('https://favicon.show/groups.google.com/favicon.ico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

// https://developers.google.com/apps-script/advanced/admin-sdk-directory#list_all_groups
function getAllGroups() {
  let groups = [];
  let pageToken, page;
  do {
    page = AdminDirectory.Groups.list({
      "customer": "my_customer",
      "pageToken": pageToken
    });
    groups = groups.concat(page.groups || []);
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (!groups.length) throw 'No groups found.';
  return groups;
}

function getGroupSettings(groupId) {
  return AdminGroupsSettings.Groups.get(groupId);
}

// Subsumes the unlister's showGroupInDirectory: call with
// ('includeInGlobalAddressList', 'true'|'false'). Read-modify-write of the
// full resource; returns the patched settings so the client can re-render
// without a re-fetch.
function setGroupSetting(groupId, settingToChange, newSetting) {
  const group = AdminGroupsSettings.Groups.get(groupId);
  group[settingToChange] = newSetting;
  return AdminGroupsSettings.Groups.patch(group, groupId);
}

function copySettings(groupIdToCopyFrom, groupIdToCopyTo, copyDescription) {
  const settingsToCopy = AdminGroupsSettings.Groups.get(groupIdToCopyFrom);
  const existingSettings = AdminGroupsSettings.Groups.get(groupIdToCopyTo);
  settingsToCopy.email = existingSettings.email;
  settingsToCopy.name = existingSettings.name;
  if (!copyDescription) settingsToCopy.description = existingSettings.description;
  return AdminGroupsSettings.Groups.update(settingsToCopy, groupIdToCopyTo);
}

function copyGroup(groupIdToCopyFrom, newGroupId, newGroupName, newGroupDescription) {
  AdminDirectory.Groups.insert({ "email": newGroupId, "name": newGroupName, "description": newGroupDescription });
  Utilities.sleep(1000); // Admin SDK is eventually consistent; let the new group settle.
  // copyDescription=false preserves the freshly inserted email/name/description
  // (the user's overrides) and clones every other setting.
  return copySettings(groupIdToCopyFrom, newGroupId, false);
}
