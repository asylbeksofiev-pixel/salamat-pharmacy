// CLI import for large catalogue files (same pipeline as the admin panel).
//   npm run import:file -- path/to/file.xlsx [--source-code salamat-1c] [--source-name "1С SALAMAT"] [--publish] [--apply]
// Without --apply only a preview is created; review it in /admin/import and apply there, or rerun with --apply.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { prisma } from "../src/server/db";
import { FileDataProvider } from "../src/server/import/providers";
import { applyImport, createImportPreview } from "../src/server/import/pipeline";

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && !process.argv[process.argv.indexOf(a) - 1]?.startsWith("--source"));
  if (!file) throw new Error("Укажите путь к файлу .csv или .xlsx");
  const buf = await readFile(file);
  const provider = new FileDataProvider(opt("source-code") || "salamat-file", opt("source-name") || "Выгрузка SALAMAT (файл)", basename(file), buf);
  const { jobId, missingColumns } = await createImportPreview({ provider, fileName: basename(file), publishNew: process.argv.includes("--publish"), adminUserId: null });
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  if (missingColumns.length) throw new Error(job.errorMessage ?? "Нет обязательных колонок");
  console.log(`Предпросмотр ${jobId}: строк ${job.totalRows}, новых ${job.createdCount}, изменений ${job.updatedCount}, без изменений ${job.skippedCount}, отклонено ${job.rejectedCount}`);
  if (process.argv.includes("--apply")) {
    await applyImport(jobId, null);
    const done = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    console.log(`Применено: добавлено ${done.createdCount}, изменено ${done.updatedCount}, пропущено ${done.skippedCount}, отклонено ${done.rejectedCount}`);
  } else console.log("Откройте /admin/import, чтобы просмотреть ошибки и применить импорт.");
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
