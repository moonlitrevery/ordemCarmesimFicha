// Página local com os mapas gerados lado a lado e um seletor de variante.
import fs from 'fs';
import http from 'http';
import path from 'path';

const DIRS = [path.resolve('public/vtt/mapas/cineres'), path.resolve('public/vtt/jogadores/mapas/cineres')];

interface Meta {
  id: string;
  title: string;
  variant: string | null;
  size_m: [number, number];
  px_per_m: number;
  width: number;
  height: number;
  seed: number;
}

function readMetas(): { meta: Meta; file: string; bytes: number }[] {
  const out: { meta: Meta; file: string; bytes: number }[] = [];
  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.meta.json'))) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Meta;
      const img = path.join(dir, f.replace(/\.meta\.json$/, '.webp'));
      if (fs.existsSync(img)) out.push({ meta, file: img, bytes: fs.statSync(img).size });
    }
  }
  return out;
}

function page(): string {
  const groups = new Map<string, ReturnType<typeof readMetas>>();
  for (const m of readMetas()) {
    const list = groups.get(m.meta.id) ?? [];
    list.push(m);
    groups.set(m.meta.id, list);
  }
  const cards = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, list]) => {
      list.sort((a, b) => (a.meta.variant ?? '').localeCompare(b.meta.variant ?? ''));
      const options = list
        .map((m) => `<option value="/img/${encodeURIComponent(path.basename(m.file))}?v=${fs.statSync(m.file).mtimeMs}">${m.meta.variant ?? 'base'}</option>`)
        .join('');
      const m = list[0].meta;
      return `<section class="card">
  <header><h2>${m.title}</h2>
  <select ${list.length < 2 ? 'disabled' : ''} onchange="this.closest('section').querySelector('img').src=this.value">${options}</select></header>
  <p>${id} · ${m.size_m.join(' × ')} m · ${m.px_per_m} px/m · ${m.width}×${m.height} px · ${(list[0].bytes / 1048576).toFixed(2)} MB · semente ${m.seed}</p>
  <a class="frame" href="#" onclick="this.classList.toggle('zoom');return false"><img loading="lazy" src="/img/${encodeURIComponent(path.basename(list[0].file))}?v=${fs.statSync(list[0].file).mtimeMs}" alt="${m.title}"></a>
</section>`;
    })
    .join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mapas táticos — prévia</title>
<style>
:root{color-scheme:dark;--bg:#14110f;--panel:#201b18;--ink:#e9e1d3;--muted:#a69a88;--line:#3a312b;--crimson:#9b1d20}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,sans-serif}
main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:16px;padding:16px}
h1{margin:16px 16px 0;font-size:20px}h2{margin:0;font-size:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
.card header{display:flex;justify-content:space-between;gap:8px;align-items:center}
.card p{color:var(--muted);font-size:12px;margin:6px 0 10px}
select{background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 8px}
.frame{display:block;overflow:hidden;border-radius:6px;cursor:zoom-in}
.frame img{display:block;width:100%;height:auto}
.frame.zoom{position:fixed;inset:0;z-index:9;background:#000d;overflow:auto;cursor:zoom-out;border-radius:0}
.frame.zoom img{width:auto;max-width:none}
</style></head><body><h1>Mapas táticos gerados</h1><main>${cards || '<p>Nada gerado ainda: rode npm run maps:build -- all</p>'}</main></body></html>`;
}

export function startPreview(port: number) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/img/')) {
      const name = path.basename(decodeURIComponent(url.pathname.slice(5)));
      const file = DIRS.map((d) => path.join(d, name)).find((f) => fs.existsSync(f));
      if (!file || !name.endsWith('.webp')) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page());
  });
  server.listen(port, '127.0.0.1', () => console.log(`[maps] prévia em http://localhost:${port}`));
}
