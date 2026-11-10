// One-off migration: store every user's email lowercase and trimmed, so login is case-insensitive.
//
//   npm run normalize-emails            -> dry run, shows what would change
//   npm run normalize-emails -- --apply -> writes the changes
//
// Accounts that would collide (e.g. "Ada@x.com" and "ada@x.com") are reported and left untouched;
// decide which one to keep and fix those by hand.
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();
const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI);
// Use the raw collection so the schema's lowercase setter doesn't hide the original values
const users = mongoose.connection.db.collection("users");

const all = await users.find({}, { projection: { email: 1 } }).toArray();
const byNormalized = new Map();
for (const u of all) {
  const key = String(u.email).trim().toLowerCase();
  byNormalized.set(key, [...(byNormalized.get(key) || []), u]);
}

let changed = 0;
let conflicts = 0;
for (const [normalized, group] of byNormalized) {
  if (group.length > 1) {
    conflicts++;
    console.warn(`⚠️  Conflict for ${normalized}: ${group.map((u) => `${u.email} (${u._id})`).join(", ")}`);
    continue;
  }
  const [u] = group;
  if (u.email === normalized) continue;
  changed++;
  console.log(`${apply ? "Updating" : "Would update"}: ${u.email} -> ${normalized}`);
  if (apply) await users.updateOne({ _id: u._id }, { $set: { email: normalized } });
}

console.log(
  `\n${all.length} users checked, ${changed} ${apply ? "updated" : "to update"}, ${conflicts} conflict(s).` +
    (apply || !changed ? "" : "\nRun again with --apply to write the changes.")
);
await mongoose.disconnect();
process.exit(conflicts ? 1 : 0);
