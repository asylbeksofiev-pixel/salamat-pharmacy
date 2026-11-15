"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { bool, guarded, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { FileDataProvider, apiProviderFromEnv } from "@/server/import/providers";
import { applyImport, createImportPreview, draftProductsOfJob } from "@/server/import/pipeline";
import { ImportFileError, MAX_FILE_BYTES } from "@/server/import/parse";
import { slugify } from "@/lib/slug";

export const uploadImport = guarded("catalog.import", async (user, _prev: unknown, fd: FormData) => {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Выберите файл .csv или .xlsx");
  if (file.size > MAX_FILE_BYTES) return fail("Файл больше 10 МБ — используйте CLI-импорт (npm run import:file)");
  const sourceName = str(fd, "sourceName") || "Выгрузка SALAMAT (файл)";
  const sourceCode = slugify(str(fd, "sourceCode") || "salamat-file", 40);
  const existing = await prisma.dataSource.findUnique({ where: { code: sourceCode } });
  if (existing?.isDemo) return fail("Этот код источника зарезервирован для демо-данных");
  let jobId: string;
  try {
    const provider = new FileDataProvider(sourceCode, sourceName, file.name, Buffer.from(await file.arrayBuffer()));
    const res = await createImportPreview({ provider, fileName: file.name, publishNew: bool(fd, "publishNew"), adminUserId: user.id });
    jobId = res.jobId;
  } catch (e) {
    if (e instanceof ImportFileError) return fail(e.message);
    throw e;
  }
  await audit(user.id, "import.preview", "ImportJob", jobId, `Загружен файл «${file.name}» для предпросмотра`);
  redirect(`/admin/import/${jobId}`);
});

export const syncFromApi = guarded("catalog.import", async (user, _prev: unknown, _fd: FormData) => {
  void _fd;
  const provider = apiProviderFromEnv();
  if (!provider) return fail("API учётной системы не настроен (CATALOG_API_URL)");
  const { jobId } = await createImportPreview({ provider, fileName: `API ${new Date().toISOString()}`, publishNew: false, adminUserId: user.id });
  await audit(user.id, "import.preview", "ImportJob", jobId, "Получены данные из API учётной системы для предпросмотра");
  redirect(`/admin/import/${jobId}`);
});

export const applyImportAction = guarded("catalog.import", async (user, jobId: string, _prev: unknown, _fd: FormData) => {
  void _fd;
  await applyImport(jobId, user.id);
  revalidatePath(`/admin/import/${jobId}`);
  return done("Импорт применён");
});

export const cancelImportAction = guarded("catalog.import", async (user, jobId: string, _prev: unknown, _fd: FormData) => {
  void _fd;
  const res = await prisma.importJob.updateMany({ where: { id: jobId, status: "PREVIEW" }, data: { status: "CANCELLED" } });
  if (!res.count) return fail("Импорт уже применён или отменён");
  await prisma.importRow.deleteMany({ where: { jobId } });
  await audit(user.id, "import.cancel", "ImportJob", jobId, "Предпросмотр отменён, каталог не изменён");
  revalidatePath(`/admin/import/${jobId}`);
  return done("Отменено");
});

export const publishJobDrafts = guarded("catalog.write", async (user, jobId: string, _prev: unknown, _fd: FormData) => {
  void _fd;
  const ids = await draftProductsOfJob(jobId);
  if (!ids.length) return fail("Нет черновиков, созданных этим импортом");
  await prisma.product.updateMany({ where: { id: { in: ids } }, data: { publicationStatus: "PUBLISHED" } });
  await audit(user.id, "import.publish", "ImportJob", jobId, `Опубликовано товаров после проверки: ${ids.length}`);
  revalidatePath(`/admin/import/${jobId}`);
  return done(`Опубликовано: ${ids.length}`);
});
