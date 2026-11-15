/* Explicit, user-approved, account-scoped cloud snapshots. Never uploads chats or login tokens. */
export const SYNC_KEYS = Object.freeze([
  "z-personal-tasks-v1", "z-personal-profile-v1", "z-personal-settings-v1",
  "z-music-finder-v1", "project-z:paper-account:v1",
]);
const MAX_BYTES = 500000;
function checkSize(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) throw Error("Backup is too large to sync safely (500 KB maximum).");
  return value;
}
export function collectLocalBackup(storage = localStorage) {
  const values = {};
  for (const key of SYNC_KEYS) {
    const stored = storage.getItem(key);
    if (stored !== null) values[key] = stored;
  }
  return checkSize({ version: 1, savedAt: new Date().toISOString(), values });
}
export function validateBackup(value) {
  if (!value || value.version !== 1 || !value.values || typeof value.values !== "object" || Array.isArray(value.values)) throw Error("Cloud backup format is invalid.");
  const values = {};
  for (const key of SYNC_KEYS) {
    const data = value.values[key];
    if (data === undefined) continue;
    if (typeof data !== "string") throw Error("Cloud backup contains an invalid entry.");
    values[key] = data;
  }
  return checkSize({ version: 1, savedAt: String(value.savedAt || ""), values });
}
function assertUser(user) {
  if (!user || !/^[a-f0-9-]{36}$/i.test(user.id || "")) throw Error("Sign in to your Z account first.");
}
export async function getCloudBackup(client, user) {
  assertUser(user);
  const { data, error } = await client.from("z_user_backups").select("data,updated_at").eq("user_id",user.id).maybeSingle();
  if (error) throw error;
  return data ? { backup: validateBackup(data.data), updatedAt: data.updated_at } : null;
}
export async function uploadCloudBackup(client, user, storage = localStorage) {
  assertUser(user);
  const backup = collectLocalBackup(storage);
  if (!Object.keys(backup.values).length) throw Error("No local My Day, Music, or paper data to back up.");
  const { error } = await client.from("z_user_backups").upsert({
    user_id: user.id, data: backup, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
  return backup;
}
export function applyCloudBackup(backup, storage = localStorage) {
  const validated = validateBackup(backup);
  // Keep an on-device rollback before touching data. Never touch authentication storage.
  const previous = collectLocalBackup(storage);
  storage.setItem("z-cloud-backup-rollback-v1", JSON.stringify(previous));
  for (const [key, value] of Object.entries(validated.values)) storage.setItem(key,value);
  return Object.keys(validated.values).length;
}
