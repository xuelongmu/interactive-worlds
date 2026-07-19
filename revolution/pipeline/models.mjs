/** Tripo → GLB props for gameplay scenes (signing desk, sand tables).
 *  Usage: node pipeline/models.mjs
 */
import { requireKey, download, pollUntil, loadCache, saveCache, hash } from "./lib.mjs";

const API = "https://api.tripo3d.ai/v2/openapi";
const CACHE_FILE = "pipeline/.models-cache.json";

const models = [
  { file: "quill.glb", prompt: "A single white goose feather quill pen, 18th century writing instrument, realistic" },
  { file: "inkwell.glb", prompt: "A small 18th century glass and pewter inkwell with dark iron gall ink, realistic" },
  { file: "parchment.glb", prompt: "A large aged parchment document laid flat, slightly curled edges, 18th century, realistic" },
  { file: "writing-desk.glb", prompt: "An 18th century mahogany writing table with green baize top, colonial American, realistic" },
  // Saratoga / Yorktown sand tables (spikes/sandtable)
  { file: "unit-block-infantry.glb", prompt: "A small rectangular wooden military unit block for an 18th century war-room sand table, painted wood with a hand-painted stripe on top, slightly worn edges, realistic" },
  { file: "unit-block-command.glb", prompt: "A small square wooden command marker block for an 18th century war-room sand table, painted wood with a hand-painted crown emblem on top, slightly worn, realistic" },
  { file: "map-table.glb", prompt: "A large 18th century military campaign map table, heavy oak with a raised wooden rim around a flat sand tray top, iron corner fittings, realistic" },
];

const key = requireKey("TRIPO_API_KEY", "3D model generation");
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const cache = loadCache(CACHE_FILE);

for (const model of models) {
  const signature = hash(model);
  if (cache[model.file] === signature) continue;
  console.log(`tripo ${model.file}…`);
  const create = await fetch(`${API}/task`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "text_to_model", prompt: model.prompt }),
  });
  if (!create.ok) throw new Error(`task create failed: ${create.status} ${await create.text()}`);
  const { data } = await create.json();

  const task = await pollUntil(
    async () => {
      const poll = await fetch(`${API}/task/${data.task_id}`, { headers });
      if (!poll.ok) throw new Error(`poll failed ${poll.status}`);
      const body = (await poll.json()).data;
      if (body.status === "failed" || body.status === "banned") {
        throw new Error(`task ${body.status}`);
      }
      return body.status === "success" ? body : null;
    },
    { intervalMs: 5000, label: model.file }
  );
  console.log("");
  const url = task.output?.pbr_model ?? task.output?.model;
  if (!url) throw new Error(`no model url in output for ${model.file}`);
  await download(url, `public/assets/models/${model.file}`);
  cache[model.file] = signature;
  // persist after every paid task so a mid-run failure never re-bills done models
  saveCache(CACHE_FILE, cache);
}
console.log("done");
