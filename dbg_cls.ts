// Тест классификации строк без импорта приватных функций
import { parseMenuText } from "./src/lib/server/menu";
import { execFile } from "child_process";
import { promisify } from "util";
import { fetchWithTimeout } from "./src/lib/server/sources";
const execFileAsync = promisify(execFile);

async function main() {
  const response = await fetchWithTimeout("https://sesc.nsu.ru/upload/iblock/e17/b1z4tiv06cln7jf1lliisik4h2z9aidf/menu_30.08.26.pdf", { timeoutMs: 25000 });
  const pdfBytes = new Uint8Array(await response.arrayBuffer());
  const { stdout } = await execFileAsync("pdftotext", ["-layout", "-", "-"], { maxBuffer: 8*1024*1024, input: undefined } as never).catch(async () => {
    const { writeFile, unlink } = await import("fs/promises");
    const os = await import("os"); const path = await import("path");
    const tmp = path.join(os.tmpdir(), "dbg-menu.pdf");
    await writeFile(tmp, pdfBytes);
    return execFileAsync("pdftotext", ["-layout", tmp, "-"], { maxBuffer: 8*1024*1024 });
  });
  // показать сырые строки вокруг "Итого"
  const lines = stdout.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/Итого/.test(l)) {
      console.log(`L${i}: [${l.trim().slice(0, 100)}]`);
    }
  });
  console.log("---- Полдник block ----");
  let start = lines.findIndex(l => l.trim() === "Полдник");
  for (let i = start; i < start + 12; i++) console.log(`L${i}: [${lines[i].trim().slice(0, 110)}]`);
}
main().catch(console.error);
